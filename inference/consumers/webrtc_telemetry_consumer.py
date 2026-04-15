from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from aiokafka.errors import KafkaError
from motor.motor_asyncio import AsyncIOMotorDatabase
from redis.asyncio import Redis

from inference.webrtc_metrics import (
    webrtcqoe_actual_congestion,
    webrtcqoe_adaptation_decisions_counter,
    webrtcqoe_brisque_score,
    webrtcqoe_congestion_prediction,
    webrtcqoe_freeze_count,
    webrtcqoe_fsm_transitions_counter,
    webrtcqoe_packet_loss_gauge,
    webrtcqoe_quality_limitation_reason_gauge,
    webrtcqoe_rtt_gauge,
    webrtcqoe_score_histogram,
    webrtcqoe_sr_active_gauge,
)
from inference.services.webrtc_qoe_service import (
    WebRTCQoEResult,
    WebRTCQoEService,
    WebRTCTelemetryDoc,
)

logger = logging.getLogger("mobcloudx.webrtc.consumer")


def _configure_logging() -> None:
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [session_id=%(session_id)s] %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


class SessionLoggerAdapter(logging.LoggerAdapter):
    def process(self, msg: str, kwargs: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        extra = kwargs.setdefault("extra", {})
        extra.setdefault("session_id", self.extra.get("session_id", "n/a"))
        return msg, kwargs


@dataclass(slots=True)
class FSMAction:
    targetBitrateKbps: int
    targetResolution: str
    enableSR: bool
    increaseFEC: bool
    reduceKeyframeInterval: bool
    logLevel: str


FSM_ACTIONS: dict[str, FSMAction] = {
    "HD-Call": FSMAction(2500, "1080p", False, False, False, "info"),
    "Bandwidth-Constrained": FSMAction(600, "480p", True, False, False, "warn"),
    "CPU-Constrained": FSMAction(800, "720p", False, False, False, "warn"),
    "High-Latency": FSMAction(1200, "720p", False, False, True, "warn"),
    "Packet-Loss-Dominant": FSMAction(400, "360p", False, True, True, "critical"),
    "Recovery": FSMAction(1000, "720p", False, False, False, "info"),
}


@dataclass(slots=True)
class FSMStatus:
    current_state: str = "Recovery"
    pending_state: str | None = None
    pending_count: int = 0


@dataclass(slots=True)
class PendingCongestionLabel:
    mongo_id: Any
    telemetry: WebRTCTelemetryDoc


class WebRTCFSMEngine:
    DEBOUNCE_COUNT = 3

    def __init__(self) -> None:
        self.status_by_participant: dict[tuple[str, str], FSMStatus] = {}

    def update(self, telemetry: WebRTCTelemetryDoc, qoe: WebRTCQoEResult) -> dict[str, Any]:
        key = (telemetry.session_id, telemetry.participant_id)
        status = self.status_by_participant.setdefault(key, FSMStatus())
        previous_state = status.current_state
        computed_target = self._compute_target_state(telemetry, qoe)
        target_state = previous_state if computed_target == "Recovery" and previous_state == "HD-Call" else computed_target

        if target_state == status.current_state:
            status.pending_state = None
            status.pending_count = 0
            return {
                "previousState": previous_state,
                "currentState": status.current_state,
                "changed": False,
                "reason": self._reason(status.current_state, telemetry, qoe),
                "recommendedAction": FSM_ACTIONS[status.current_state].__dict__,
            }

        if status.pending_state == target_state:
            status.pending_count += 1
        else:
            status.pending_state = target_state
            status.pending_count = 1

        if status.pending_count >= self.DEBOUNCE_COUNT:
            status.current_state = target_state
            status.pending_state = None
            status.pending_count = 0
            return {
                "previousState": previous_state,
                "currentState": status.current_state,
                "changed": True,
                "reason": self._reason(status.current_state, telemetry, qoe),
                "recommendedAction": FSM_ACTIONS[status.current_state].__dict__,
            }

        return {
            "previousState": previous_state,
            "currentState": status.current_state,
            "changed": False,
            "reason": f"Observed {target_state} conditions {status.pending_count}/{self.DEBOUNCE_COUNT} consecutive intervals; holding {status.current_state}.",
            "recommendedAction": FSM_ACTIONS[status.current_state].__dict__,
        }

    @staticmethod
    def _ms(value: float) -> float:
        return value * 1000 if 0 < value < 10 else value

    def _compute_target_state(self, telemetry: WebRTCTelemetryDoc, qoe: WebRTCQoEResult) -> str:
        rtt_ms = self._ms(telemetry.currentRoundTripTime)
        packet_loss_rate = telemetry.packetLossRate
        if telemetry.qualityLimitationReason == "cpu":
            return "CPU-Constrained"
        if packet_loss_rate > 0.05 or telemetry.pliCount > 5:
            return "Packet-Loss-Dominant"
        if rtt_ms > 200 and packet_loss_rate < 0.03:
            return "High-Latency"
        if telemetry.qualityLimitationReason == "bandwidth" or (telemetry.availableOutgoingBitrate < 800000 and qoe.score < 70):
            return "Bandwidth-Constrained"
        if (
            rtt_ms < 150
            and packet_loss_rate < 0.02
            and telemetry.framesPerSecond >= 20
            and telemetry.qualityLimitationReason not in {"bandwidth", "cpu"}
        ):
            return "Recovery"
        if (
            rtt_ms < 100
            and packet_loss_rate < 0.01
            and telemetry.framesPerSecond >= 25
            and telemetry.qualityLimitationReason == "none"
            and qoe.score >= 80
        ):
            return "HD-Call"
        return "Recovery"

    def _reason(self, state: str, telemetry: WebRTCTelemetryDoc, qoe: WebRTCQoEResult) -> str:
        rtt_ms = self._ms(telemetry.currentRoundTripTime)
        packet_loss = telemetry.packetLossRate * 100
        if state == "CPU-Constrained":
            return f"Encoder reported CPU limitation while rendering {int(telemetry.frameHeight)}p at {telemetry.framesPerSecond:.0f}fps."
        if state == "Packet-Loss-Dominant":
            return f"Packet loss reached {packet_loss:.1f}% with {telemetry.pliCount} PLI requests in the last interval."
        if state == "High-Latency":
            return f"Round-trip time rose to {rtt_ms:.0f}ms while packet loss stayed below 3%, indicating latency-dominant degradation."
        if state == "Bandwidth-Constrained":
            return f"Available outgoing bitrate dropped to {telemetry.availableOutgoingBitrate / 1000:.0f} kbps with QoE at {qoe.score:.0f}."
        if state == "Recovery":
            return f"Transport conditions are stabilising with RTT {rtt_ms:.0f}ms, packet loss {packet_loss:.1f}%, and {telemetry.framesPerSecond:.0f}fps."
        return f"Connection is stable for HD delivery with RTT {rtt_ms:.0f}ms, packet loss {packet_loss:.1f}%, and QoE {qoe.score:.0f}."


class WebRTCTelemetryConsumer:
    def __init__(self, database: AsyncIOMotorDatabase) -> None:
        _configure_logging()
        bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", os.getenv("KAFKA_BROKERS", "localhost:29092"))
        self.database = database
        self.telemetry_topic = os.getenv("WEBRTC_TELEMETRY_TOPIC", "webrtc-telemetry")
        self.qoe_topic = os.getenv("WEBRTC_QOE_TOPIC", "webrtc-qoe-scores")
        self.adaptation_topic = os.getenv("WEBRTC_ADAPTATION_TOPIC", "webrtc-adaptations")
        self.dlq_topic = os.getenv("WEBRTC_TELEMETRY_DLQ_TOPIC", "webrtc-telemetry-dlq")
        self.redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        self.consumer = AIOKafkaConsumer(
            self.telemetry_topic,
            bootstrap_servers=bootstrap_servers,
            group_id="webrtc-qoe-processor",
            auto_offset_reset="latest",
            enable_auto_commit=False,
            max_poll_records=100,
        )
        self.producer = AIOKafkaProducer(bootstrap_servers=bootstrap_servers)
        self.redis: Redis | None = None
        self.qoe_service = WebRTCQoEService(database)
        self.fsm_engine = WebRTCFSMEngine()
        self.pending_congestion_labels: dict[tuple[str, str], deque[PendingCongestionLabel]] = {}
        self.stop_event = asyncio.Event()
        self._signal_handlers_registered = False

    async def start(self) -> None:
        await self.consumer.start()
        await self.producer.start()
        self.redis = Redis.from_url(self.redis_url, decode_responses=True)
        self._register_signal_handlers()
        logger.info("WebRTC telemetry consumer started", extra={"session_id": "system"})

    async def stop(self) -> None:
        self.stop_event.set()
        await self._flush_pending_congestion_labels()
        await self.consumer.stop()
        await self.producer.stop()
        if self.redis is not None:
            await self.redis.aclose()
        logger.info("WebRTC telemetry consumer stopped", extra={"session_id": "system"})

    async def run(self) -> None:
        await self.start()
        try:
            while not self.stop_event.is_set():
                result_batch = await self.consumer.getmany(timeout_ms=1000, max_records=100)
                if not result_batch:
                    continue
                for _, messages in result_batch.items():
                    await self._process_batch(list(messages))
                await self.consumer.commit()
        finally:
            await self.stop()

    async def _process_batch(self, messages: list[Any]) -> None:
        for message in messages:
            telemetry_doc: WebRTCTelemetryDoc | None = None
            try:
                payload = json.loads(message.value.decode("utf-8"))
                telemetry_doc = self._normalize_payload(payload)
                session_logger = SessionLoggerAdapter(logger, {"session_id": telemetry_doc.session_id})
                qoe_result = await self.qoe_service.compute_realtime_qoe(telemetry_doc)
                transition = self.fsm_engine.update(telemetry_doc, qoe_result)
                fsm_state = transition["currentState"]
                congestion_probability_raw = payload.get("congestion_probability")
                predicted_bitrate_raw = payload.get("predicted_bitrate_kbps")
                congestion_probability = (
                    float(congestion_probability_raw)
                    if congestion_probability_raw not in (None, "")
                    else None
                )
                predicted_bitrate_kbps = (
                    float(predicted_bitrate_raw)
                    if predicted_bitrate_raw not in (None, "")
                    else None
                )
                sr_active = bool(payload.get("sr_active", False))
                brisque_score_raw = payload.get("brisque_score")
                brisque_score = (
                    float(brisque_score_raw)
                    if brisque_score_raw not in (None, "")
                    else None
                )
                sr_frames_processed = int(payload.get("sr_frames_processed", 0) or 0)
                insert_result = await self.database["webrtc_telemetry"].insert_one(
                    {
                        **telemetry_doc.model_dump(),
                        "rtt_ms": self.fsm_engine._ms(telemetry_doc.currentRoundTripTime),
                        "jitter_ms": self.fsm_engine._ms(telemetry_doc.jitter),
                        "available_bitrate_kbps": telemetry_doc.availableOutgoingBitrate / 1000,
                        "fps": telemetry_doc.framesPerSecond,
                        "qoe_score": qoe_result.score,
                        "dominant_issue": qoe_result.dominantIssue,
                        "fsm_state": fsm_state,
                        "congestion_probability": congestion_probability,
                        "predicted_bitrate_kbps": predicted_bitrate_kbps,
                        "sr_active": sr_active,
                        "brisque_score": brisque_score,
                        "sr_frames_processed": sr_frames_processed,
                        "actual_congestion_event": False,
                    }
                )
                await self._enqueue_congestion_label(
                    telemetry_doc=telemetry_doc,
                    mongo_id=insert_result.inserted_id,
                )

                await self.producer.send_and_wait(
                    self.qoe_topic,
                    key=telemetry_doc.participant_id.encode("utf-8"),
                    value=json.dumps(
                        {
                            "session_id": telemetry_doc.session_id,
                            "participant_id": telemetry_doc.participant_id,
                            "timestamp": int(telemetry_doc.timestamp.timestamp() * 1000),
                            "qoe_score": qoe_result.score,
                            "fsm_state": fsm_state,
                            "dominant_issue": qoe_result.dominantIssue,
                            "server_computed": True,
                        }
                    ).encode("utf-8"),
                )

                self._record_metrics(
                    telemetry_doc,
                    qoe_result,
                    transition,
                    congestion_probability,
                    sr_active,
                    brisque_score,
                )

                if qoe_result.score < 60:
                    adaptation_payload = {
                        "session_id": telemetry_doc.session_id,
                        "participant_id": telemetry_doc.participant_id,
                        "timestamp": telemetry_doc.timestamp,
                        "decision_type": "low_qoe_alert",
                        "trigger_reason": qoe_result.dominantIssue,
                        "fsm_state": fsm_state,
                        "before_state": telemetry_doc.model_dump(),
                        "after_state": transition["recommendedAction"],
                        "qoe_score": qoe_result.score,
                    }
                    await self.database["webrtc_adaptations"].insert_one(adaptation_payload)
                    await self.producer.send_and_wait(
                        self.adaptation_topic,
                        key=telemetry_doc.participant_id.encode("utf-8"),
                        value=json.dumps(
                            {
                                **adaptation_payload,
                                "timestamp": int(telemetry_doc.timestamp.timestamp() * 1000),
                            },
                            default=str,
                        ).encode("utf-8"),
                    )
                    await self._publish_channel_event(
                        telemetry_doc.session_id,
                        "qoe.alert",
                        {
                            "participant_id": telemetry_doc.participant_id,
                            "qoe_score": qoe_result.score,
                            "fsm_state": fsm_state,
                            "dominant_issue": qoe_result.dominantIssue,
                        },
                    )
                    webrtcqoe_adaptation_decisions_counter.labels(
                        decision_type="low_qoe_alert",
                        trigger_reason=qoe_result.dominantIssue,
                        fsm_state=fsm_state,
                    ).inc()

                if transition["changed"]:
                    await self._publish_channel_event(
                        telemetry_doc.session_id,
                        "fsm.transition",
                        {
                            "participant_id": telemetry_doc.participant_id,
                            "previous_state": transition["previousState"],
                            "current_state": transition["currentState"],
                            "reason": transition["reason"],
                        },
                    )
                    webrtcqoe_fsm_transitions_counter.labels(
                        from_state=transition["previousState"],
                        to_state=transition["currentState"],
                        reason=transition["reason"],
                    ).inc()

                session_logger.info("Processed WebRTC telemetry message")
            except Exception as exc:
                session_id = telemetry_doc.session_id if telemetry_doc else "unknown"
                SessionLoggerAdapter(logger, {"session_id": session_id}).error(
                    "Failed to process telemetry message: %s", exc
                )
                await self._publish_dlq(message.value, str(exc))

    def _normalize_payload(self, payload: dict[str, Any]) -> WebRTCTelemetryDoc:
        normalized_payload = {
            "session_id": str(payload["session_id"]),
            "participant_id": str(payload["participant_id"]),
            "timestamp": datetime.fromtimestamp(int(payload["timestamp"]) / 1000, tz=UTC),
            "frameWidth": float(payload.get("frameWidth", 0)),
            "frameHeight": float(payload.get("frameHeight", 0)),
            "framesPerSecond": float(payload.get("framesPerSecond", payload.get("fps", 0))),
            "packetsLost": float(payload.get("packetsLost", 0)),
            "packetLossRate": float(payload.get("packetLossRate", payload.get("packet_loss_rate", 0))),
            "jitter": float(payload.get("jitter", payload.get("jitter_ms", 0))),
            "freezeCount": int(payload.get("freezeCount", payload.get("freeze_count", 0))),
            "freezeRatePerMin": float(payload.get("freezeRatePerMin", 0)),
            "qualityLimitationReason": str(payload.get("qualityLimitationReason", "none")),
            "pliCount": int(payload.get("pliCount", 0)),
            "jitterBufferDelay": float(payload.get("jitterBufferDelay", 0)),
            "concealedSamplesRatio": float(payload.get("concealedSamplesRatio", 0)),
            "currentRoundTripTime": float(payload.get("currentRoundTripTime", payload.get("rtt_ms", 0))),
            "availableOutgoingBitrate": float(payload.get("availableOutgoingBitrate", payload.get("available_bitrate_kbps", 0) * 1000)),
            "audioLevel": float(payload.get("audioLevel", 0)),
            "concealedSamples": float(payload.get("concealedSamples", 0)),
            "totalSamplesReceived": float(payload.get("totalSamplesReceived", 0)),
            "bytesReceived": float(payload.get("bytesReceived", 0)),
            "videoBitrateKbps": float(payload.get("videoBitrateKbps", 0)),
            "totalFreezesDuration": float(payload.get("totalFreezesDuration", 0)),
            "nackCount": int(payload.get("nackCount", 0)),
            "concealmentEvents": float(payload.get("concealmentEvents", 0)),
            "echoReturnLoss": float(payload.get("echoReturnLoss", 0)),
            "networkBytesSent": float(payload.get("networkBytesSent", 0)),
            "networkBytesReceived": float(payload.get("networkBytesReceived", 0)),
        }
        required_fields = [
            field_name
            for field_name in ["session_id", "participant_id", "timestamp", "currentRoundTripTime", "jitter", "packetLossRate", "framesPerSecond", "availableOutgoingBitrate"]
            if normalized_payload[field_name] in ("", None)
        ]
        if required_fields:
            raise ValueError(f"Missing required fields: {', '.join(required_fields)}")
        return WebRTCTelemetryDoc(**normalized_payload)

    def _record_metrics(
        self,
        telemetry: WebRTCTelemetryDoc,
        qoe: WebRTCQoEResult,
        transition: dict[str, Any],
        congestion_probability: float | None,
        sr_active: bool,
        brisque_score: float | None,
    ) -> None:
        labels = {
            "participant_id": telemetry.participant_id,
            "session_id": telemetry.session_id,
        }
        webrtcqoe_score_histogram.labels(
            participant_id=telemetry.participant_id,
            session_id=telemetry.session_id,
            fsm_state=transition["currentState"],
        ).observe(qoe.score)
        webrtcqoe_rtt_gauge.labels(**labels).set(self.fsm_engine._ms(telemetry.currentRoundTripTime))
        webrtcqoe_packet_loss_gauge.labels(**labels).set(telemetry.packetLossRate)
        webrtcqoe_freeze_count.labels(**labels).inc(telemetry.freezeCount)
        webrtcqoe_sr_active_gauge.labels(participant_id=telemetry.participant_id).set(1 if sr_active else 0)
        webrtcqoe_brisque_score.labels(
            participant_id=telemetry.participant_id,
            session_id=telemetry.session_id,
        ).set(brisque_score or 0)
        if congestion_probability is not None:
            webrtcqoe_congestion_prediction.labels(**labels).set(congestion_probability)
        for reason in ("bandwidth", "cpu", "none"):
            value = 1 if telemetry.qualityLimitationReason == reason else 0
            webrtcqoe_quality_limitation_reason_gauge.labels(
                session_id=telemetry.session_id,
                participant_id=telemetry.participant_id,
                reason=reason,
            ).set(value)

    async def _enqueue_congestion_label(self, telemetry_doc: WebRTCTelemetryDoc, mongo_id: Any) -> None:
        key = (telemetry_doc.session_id, telemetry_doc.participant_id)
        pending = self.pending_congestion_labels.setdefault(key, deque())
        pending.append(PendingCongestionLabel(mongo_id=mongo_id, telemetry=telemetry_doc))
        if len(pending) <= 5:
            return

        current = pending.popleft()
        actual_event = any(self._is_congestion_event(item.telemetry) for item in pending)
        await self.database["webrtc_telemetry"].update_one(
            {"_id": current.mongo_id},
            {"$set": {"actual_congestion_event": actual_event}},
        )
        webrtcqoe_actual_congestion.labels(
            participant_id=current.telemetry.participant_id,
            session_id=current.telemetry.session_id,
        ).set(1 if actual_event else 0)

    async def _flush_pending_congestion_labels(self) -> None:
        for key, pending in self.pending_congestion_labels.items():
            session_id, participant_id = key
            while pending:
                current = pending.popleft()
                actual_event = any(self._is_congestion_event(item.telemetry) for item in pending)
                await self.database["webrtc_telemetry"].update_one(
                    {"_id": current.mongo_id},
                    {"$set": {"actual_congestion_event": actual_event}},
                )
                webrtcqoe_actual_congestion.labels(
                    participant_id=participant_id,
                    session_id=session_id,
                ).set(1 if actual_event else 0)

    @staticmethod
    def _is_congestion_event(telemetry_doc: WebRTCTelemetryDoc) -> bool:
        return telemetry_doc.packetLossRate > 0.05 or telemetry_doc.freezeCount > 0 or telemetry_doc.totalFreezesDuration > 0

    async def _publish_channel_event(self, session_id: str, event_type: str, payload: dict[str, Any]) -> None:
        if self.redis is None:
            return
        await self.redis.publish(
            f"call_{session_id}",
            json.dumps({"type": event_type, "group": f"call_{session_id}", "payload": payload}, default=str),
        )

    async def _publish_dlq(self, raw_value: bytes, error_message: str) -> None:
        try:
            payload = {
                "error": error_message,
                "raw_message": raw_value.decode("utf-8", errors="replace"),
                "timestamp": int(datetime.now(tz=UTC).timestamp() * 1000),
            }
            await self.producer.send_and_wait(self.dlq_topic, value=json.dumps(payload).encode("utf-8"))
        except KafkaError as kafka_error:
            logger.error("Failed to publish DLQ message: %s", kafka_error, extra={"session_id": "unknown"})

    def _register_signal_handlers(self) -> None:
        if self._signal_handlers_registered:
            return
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            try:
                loop.add_signal_handler(sig, self.stop_event.set)
            except NotImplementedError:
                signal.signal(sig, lambda *_: self.stop_event.set())
        self._signal_handlers_registered = True
