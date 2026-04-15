from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any

import numpy as np
from motor.motor_asyncio import AsyncIOMotorDatabase
from prometheus_client import Gauge

from inference.fl.cross_context_transfer import measure_convergence_delta


MIN_CLIENTS = 3
BASE_LEARNING_RATE = 0.1
LR_DECAY = 0.95
AGGREGATION_INTERVAL_SECONDS = 6 * 60 * 60
DP_CLIP_NORM = 1.0
DP_SIGMA = 0.5
DEFAULT_WEBRTC_WEIGHTS = np.asarray([0.35, 0.35, 0.15, 0.10, 0.05], dtype=np.float32)

webrtcqoe_fl_ott_loss = Gauge(
    "webrtcqoe_fl_ott_loss",
    "OTT reference validation loss by FL round",
    labelnames=["round_number"],
)

webrtcqoe_fl_webrtc_loss = Gauge(
    "webrtcqoe_fl_webrtc_loss",
    "WebRTC federated validation loss by FL round",
    labelnames=["round_number"],
)

webrtcqoe_fl_convergence_speedup = Gauge(
    "webrtcqoe_fl_convergence_speedup",
    "Convergence speedup ratio from OTT transfer initialization",
)


@dataclass(slots=True)
class WebRTCFLRoundResult:
    round_number: int
    global_weights: list[float]
    val_loss: float
    client_count: int
    convergence_metric: dict[str, float | int]


class FLServer:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.round_number = 0
        self.last_processed_timestamp: datetime | None = None
        self.stop_event = asyncio.Event()
        self.transfer_init_history: list[float] = []
        self.random_init_history: list[float] = []

    async def start_periodic_webrtc_fl(self) -> None:
        while not self.stop_event.is_set():
            try:
                await self.run_webrtc_fl_round()
            except Exception as exc:
                print(f"⚠ WebRTC FL round failed: {exc}")

            try:
                await asyncio.wait_for(self.stop_event.wait(), timeout=AGGREGATION_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                continue

    async def stop(self) -> None:
        self.stop_event.set()

    async def get_latest_webrtc_model(self) -> dict[str, Any] | None:
        return await self.db["federated_models"].find_one(
            {"model_type": "webrtc_qoe"},
            sort=[("round_number", -1), ("updated_at", -1)],
        )

    async def get_current_global_weights(self) -> tuple[np.ndarray, int]:
        latest = await self.get_latest_webrtc_model()
        if latest is None:
            return DEFAULT_WEBRTC_WEIGHTS.copy(), 0
        return (
            np.asarray(latest.get("global_weights", DEFAULT_WEBRTC_WEIGHTS.tolist()), dtype=np.float32),
            int(latest.get("round_number", 0)),
        )

    async def run_webrtc_fl_round(self) -> WebRTCFLRoundResult:
        query: dict[str, Any] = {}
        if self.last_processed_timestamp is not None:
            query["timestamp"] = {"$gt": self.last_processed_timestamp}

        updates = await self.db["webrtc_fl_updates"].find(query).sort("timestamp", 1).to_list(length=5000)
        if len(updates) < MIN_CLIENTS:
            weights, round_number = await self.get_current_global_weights()
            convergence_metric = self._build_convergence_metric(float(np.mean(np.square(weights))))
            result = WebRTCFLRoundResult(
                round_number=round_number,
                global_weights=weights.astype(float).tolist(),
                val_loss=float(np.mean(np.square(weights))),
                client_count=len(updates),
                convergence_metric=convergence_metric,
            )
            await self._record_round_metrics(result, aggregated=False)
            return result

        current_weights, current_round = await self.get_current_global_weights()
        next_round = current_round + 1
        lr = BASE_LEARNING_RATE if next_round <= 5 else BASE_LEARNING_RATE * (LR_DECAY ** (next_round - 5))

        gradient_updates = np.asarray(
            [np.asarray(update["gradient_update"], dtype=np.float32) for update in updates],
            dtype=np.float32,
        )
        mean_gradient = gradient_updates.mean(axis=0)
        clipped_gradient = self._clip_and_noise(mean_gradient, sigma=DP_SIGMA)
        updated_weights = current_weights + lr * clipped_gradient
        val_loss = self._estimate_validation_loss(updated_weights, updates)

        self.round_number = next_round
        self.last_processed_timestamp = max(
            self._coerce_datetime(update["timestamp"]) for update in updates if update.get("timestamp") is not None
        )

        self.transfer_init_history.append(val_loss)
        self.random_init_history.append(float(np.mean(np.square(DEFAULT_WEBRTC_WEIGHTS))))
        convergence_metric = self._build_convergence_metric(val_loss)
        ott_loss = await self._get_latest_ott_loss()

        model_document = {
            "model_type": "webrtc_qoe",
            "round_number": next_round,
            "global_weights": updated_weights.astype(float).tolist(),
            "val_loss": val_loss,
            "ott_reference_loss": ott_loss,
            "client_count": len(updates),
            "updated_at": datetime.now(tz=UTC),
            "convergence_metric": convergence_metric,
        }
        await self.db["federated_models"].insert_one(model_document)

        webrtcqoe_fl_webrtc_loss.labels(round_number=str(next_round)).set(val_loss)
        webrtcqoe_fl_ott_loss.labels(round_number=str(next_round)).set(ott_loss)
        webrtcqoe_fl_convergence_speedup.set(
            float(convergence_metric.get("convergence_speedup_ratio", 1.0))
        )

        result = WebRTCFLRoundResult(
            round_number=next_round,
            global_weights=updated_weights.astype(float).tolist(),
            val_loss=val_loss,
            client_count=len(updates),
            convergence_metric=convergence_metric,
        )
        await self._record_round_metrics(result, aggregated=True)
        return result

    def _estimate_validation_loss(self, weights: np.ndarray, updates: list[dict[str, Any]]) -> float:
        gradient_stack = np.asarray([np.asarray(update["gradient_update"], dtype=np.float32) for update in updates], dtype=np.float32)
        residual = gradient_stack - weights.reshape(1, -1)
        return float(np.mean(np.square(residual)))

    def _build_convergence_metric(self, val_loss: float) -> dict[str, float | int]:
        delta = measure_convergence_delta(self.transfer_init_history, self.random_init_history)
        delta["latest_val_loss"] = float(val_loss)
        return delta

    async def _record_round_metrics(self, result: WebRTCFLRoundResult, aggregated: bool) -> None:
        payload = asdict(result)
        payload["aggregated"] = aggregated
        payload["recorded_at"] = datetime.now(tz=UTC)
        await self.db["webrtc_fl_rounds"].insert_one(payload)

    async def _get_latest_ott_loss(self) -> float:
        ott_doc = await self.db["federated_models"].find_one(
            {
                "model_type": {
                    "$in": ["ott_qoe", "ott_lstm", "ott", "qoe_federated"],
                }
            },
            sort=[("round_number", -1), ("updated_at", -1)],
        )
        if ott_doc is None:
            return float(np.mean(np.square(DEFAULT_WEBRTC_WEIGHTS)))

        for field in ("val_loss", "train_loss", "loss"):
            value = ott_doc.get(field)
            if isinstance(value, (int, float)):
                return float(value)
        return float(np.mean(np.square(DEFAULT_WEBRTC_WEIGHTS)))

    @staticmethod
    def _clip_and_noise(gradient: np.ndarray, sigma: float) -> np.ndarray:
        grad = gradient.astype(np.float32)
        norm = float(np.linalg.norm(grad))
        if norm > DP_CLIP_NORM:
            grad = grad * (DP_CLIP_NORM / (norm + 1e-8))
        noise = np.random.normal(0.0, sigma * DP_CLIP_NORM, size=grad.shape).astype(np.float32)
        return grad + noise

    @staticmethod
    def _coerce_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
        if isinstance(value, str):
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        return datetime.now(tz=UTC)
