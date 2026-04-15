from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

webrtcqoe_score_histogram = Histogram(
    "webrtcqoe_score_histogram",
    "Distribution of WebRTC QoE scores",
    labelnames=["participant_id", "session_id", "fsm_state"],
    buckets=[10, 20, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100],
)

webrtcqoe_rtt_gauge = Gauge(
    "webrtcqoe_rtt_gauge",
    "Current RTT in milliseconds",
    labelnames=["participant_id", "session_id"],
)

webrtcqoe_packet_loss_gauge = Gauge(
    "webrtcqoe_packet_loss_gauge",
    "Current packet loss rate",
    labelnames=["participant_id", "session_id"],
)

webrtcqoe_fsm_transitions_counter = Counter(
    "webrtcqoe_fsm_transitions_counter",
    "FSM transitions by source, target, and reason",
    labelnames=["from_state", "to_state", "reason"],
)

webrtcqoe_freeze_count = Counter(
    "webrtcqoe_freeze_count",
    "Observed freeze counts per participant and session",
    labelnames=["participant_id", "session_id"],
)

webrtcqoe_sr_active_gauge = Gauge(
    "webrtcqoe_sr_active_gauge",
    "Super resolution active flag",
    labelnames=["participant_id"],
)

webrtcqoe_brisque_score = Gauge(
    "webrtcqoe_brisque_score",
    "Receiver-side BRISQUE score (0-100, higher is better after inversion)",
    labelnames=["participant_id", "session_id"],
)

webrtcqoe_adaptation_decisions_counter = Counter(
    "webrtcqoe_adaptation_decisions_counter",
    "Adaptation decisions by type, trigger, and FSM state",
    labelnames=["decision_type", "trigger_reason", "fsm_state"],
)

webrtcqoe_quality_limitation_reason_gauge = Gauge(
    "webrtcqoe_quality_limitation_reason_gauge",
    "Quality limitation reason distribution",
    labelnames=["session_id", "participant_id", "reason"],
)

webrtcqoe_congestion_prediction = Gauge(
    "webrtcqoe_congestion_prediction",
    "Predicted congestion probability from the on-device ONNX model",
    labelnames=["participant_id", "session_id"],
)

webrtcqoe_actual_congestion = Gauge(
    "webrtcqoe_actual_congestion",
    "Observed congestion event label computed server-side",
    labelnames=["participant_id", "session_id"],
)


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
