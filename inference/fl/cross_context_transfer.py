from __future__ import annotations

from typing import Any

import numpy as np
import torch
from motor.motor_asyncio import AsyncIOMotorDatabase


OTT_FEATURES = ["throughput", "buffer", "qoe", "vmaf", "segment_idx", "history"]
WEBRTC_FEATURES = ["video", "audio", "rtt", "jitter", "freeze"]
CONVERGENCE_THRESHOLD = 0.05
CONSECUTIVE_ROUNDS = 3


def _integrate_auc(values: np.ndarray) -> float:
    integrator = getattr(np, "trapezoid", None)
    if integrator is not None:
        return float(integrator(values, dx=1.0))

    legacy_integrator = getattr(np, "trapz", None)
    if legacy_integrator is None:
        raise AttributeError("NumPy integration helper not available: expected trapezoid or trapz")
    return float(legacy_integrator(values, dx=1.0))


def _normalise_weights(values: np.ndarray) -> np.ndarray:
    clipped = np.maximum(values.astype(np.float32), 1e-6)
    return clipped / clipped.sum()


def _flatten_tensors(raw_weights: Any) -> list[np.ndarray]:
    if isinstance(raw_weights, dict):
        iterable = list(raw_weights.values())
    else:
        iterable = list(raw_weights or [])
    return [np.asarray(item, dtype=np.float32) for item in iterable]


def _extract_ott_importance(raw_weights: Any) -> np.ndarray:
    tensors = _flatten_tensors(raw_weights)
    if not tensors:
        return np.ones(len(OTT_FEATURES), dtype=np.float32)

    first_weight = next((tensor for tensor in tensors if tensor.ndim == 2), None)
    if first_weight is not None and first_weight.shape[0] >= len(OTT_FEATURES):
        saliency = np.mean(np.abs(first_weight[: len(OTT_FEATURES)]), axis=1)
        return saliency.astype(np.float32)

    flat = np.concatenate([tensor.reshape(-1) for tensor in tensors if tensor.size > 0], axis=0)
    if flat.size == 0:
        return np.ones(len(OTT_FEATURES), dtype=np.float32)

    chunks = np.array_split(np.abs(flat), len(OTT_FEATURES))
    return np.asarray([float(chunk.mean()) if chunk.size else 1.0 for chunk in chunks], dtype=np.float32)


def _synthetic_ott_samples(sample_count: int = 1000) -> torch.Tensor:
    rng = np.random.default_rng(42)
    throughput = rng.normal(5_000.0, 1_200.0, size=(sample_count, 1))
    buffer = rng.normal(6.0, 2.0, size=(sample_count, 1))
    qoe = rng.normal(75.0, 10.0, size=(sample_count, 1))
    vmaf = rng.normal(82.0, 8.0, size=(sample_count, 1))
    segment_idx = rng.integers(0, 6, size=(sample_count, 1)).astype(np.float32)
    history = rng.normal(0.5, 0.15, size=(sample_count, 1))
    features = np.concatenate([throughput, buffer, qoe, vmaf, segment_idx, history], axis=1).astype(np.float32)
    return torch.tensor(features, dtype=torch.float32, requires_grad=True)


async def cross_context_transfer_init(
    ott_model_id: str,
    db: AsyncIOMotorDatabase,
) -> np.ndarray:
    ott_doc = await db["federated_models"].find_one({"_id": ott_model_id}) or await db["federated_models"].find_one(
        {"model_id": ott_model_id}
    )
    if ott_doc is None:
        return np.asarray([0.30, 0.25, 0.20, 0.15, 0.10], dtype=np.float32)

    saliency = _extract_ott_importance(ott_doc.get("global_weights"))

    # Run a lightweight synthetic saliency probe so the transfer init remains
    # grounded in a data-like distribution even when only saved weights exist.
    synthetic_inputs = _synthetic_ott_samples()
    probe = torch.tensor(saliency[: len(OTT_FEATURES)], dtype=torch.float32)
    projected = synthetic_inputs * probe
    synthetic_importance = projected.abs().mean(dim=0).detach().cpu().numpy()
    synthetic_importance = _normalise_weights(synthetic_importance)

    mapped = np.zeros(len(WEBRTC_FEATURES), dtype=np.float32)
    mapped[0] = synthetic_importance[OTT_FEATURES.index("throughput")]
    mapped[1] = synthetic_importance[OTT_FEATURES.index("qoe")]
    mapped[2] = synthetic_importance[OTT_FEATURES.index("buffer")]
    mapped[3] = synthetic_importance[OTT_FEATURES.index("vmaf")]
    mapped[4] = max(
        0.05,
        1.0
        - (
            mapped[0]
            + mapped[1]
            + mapped[2]
            + mapped[3]
        ),
    )

    return _normalise_weights(mapped)


def _rounds_to_converge(history: list[float], threshold: float = CONVERGENCE_THRESHOLD) -> int:
    consecutive = 0
    for index, value in enumerate(history, start=1):
        if value < threshold:
            consecutive += 1
            if consecutive >= CONSECUTIVE_ROUNDS:
                return index - CONSECUTIVE_ROUNDS + 1
        else:
            consecutive = 0
    return len(history)


def measure_convergence_delta(
    transfer_init_history: list[float],
    random_init_history: list[float],
) -> dict[str, float | int]:
    transfer_rounds = _rounds_to_converge(transfer_init_history)
    random_rounds = _rounds_to_converge(random_init_history)
    transfer_auc = _integrate_auc(np.asarray(transfer_init_history, dtype=np.float32))
    random_auc = _integrate_auc(np.asarray(random_init_history, dtype=np.float32))

    return {
        "rounds_to_converge_transfer": transfer_rounds,
        "rounds_to_converge_random": random_rounds,
        "convergence_speedup_ratio": float(random_rounds / max(transfer_rounds, 1)),
        "area_under_curve_ratio": float(transfer_auc / max(random_auc, 1e-6)),
    }
