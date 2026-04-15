from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np


DP_CLIP_NORM = 1.0
DP_SIGMA = 1.1
LOCAL_EPOCHS = 3
LEARNING_RATE = 0.05
MAX_LOCAL_SAMPLES = 50

RESOLUTION_SCORES = {
    2160: 1.0,
    1440: 0.85,
    1080: 0.75,
    720: 0.60,
    480: 0.40,
    360: 0.25,
    240: 0.10,
}


def _resolution_score(frame_height: float) -> float:
    if frame_height >= 2160:
        return RESOLUTION_SCORES[2160]
    if frame_height >= 1440:
        return RESOLUTION_SCORES[1440]
    if frame_height >= 1080:
        return RESOLUTION_SCORES[1080]
    if frame_height >= 720:
        return RESOLUTION_SCORES[720]
    if frame_height >= 480:
        return RESOLUTION_SCORES[480]
    if frame_height >= 360:
        return RESOLUTION_SCORES[360]
    return RESOLUTION_SCORES[240]


def _to_milliseconds(value: float) -> float:
    return value * 1000.0 if 0.0 < value < 10.0 else value


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _video_quality(row: dict[str, Any]) -> float:
    fps = float(row.get("framesPerSecond", row.get("fps", 0.0)))
    packet_loss = float(row.get("packetLossRate", row.get("packet_loss_rate", 0.0)))
    frame_height = float(row.get("frameHeight", row.get("frame_height", 0.0)))
    return _clamp(
        0.4 * _clamp(fps / 30.0, 0.0, 1.0)
        + 0.35 * _clamp(1.0 - packet_loss, 0.0, 1.0)
        + 0.25 * _resolution_score(frame_height),
        0.0,
        1.0,
    )


def _audio_quality(row: dict[str, Any]) -> float:
    concealed_ratio = float(row.get("concealedSamplesRatio", row.get("concealed_samples_ratio", 0.0)))
    jitter_buffer_delay = float(row.get("jitterBufferDelay", row.get("jitter_buffer_delay", 0.0)))
    return _clamp(
        0.6 * _clamp(1.0 - concealed_ratio, 0.0, 1.0)
        + 0.4 * max(0.0, 1.0 - jitter_buffer_delay / 0.15),
        0.0,
        1.0,
    )


def _rtt_penalty(row: dict[str, Any]) -> float:
    rtt_ms = _to_milliseconds(float(row.get("currentRoundTripTime", row.get("rtt_ms", 0.0))))
    if rtt_ms < 50:
        return 0.0
    if rtt_ms <= 150:
        return ((rtt_ms - 50.0) / 100.0) * 0.3
    if rtt_ms <= 300:
        return 0.3 + ((rtt_ms - 150.0) / 150.0) * 0.5
    if rtt_ms <= 500:
        return 0.8 + ((rtt_ms - 300.0) / 200.0) * 0.2
    return 1.0


def _jitter_penalty(row: dict[str, Any]) -> float:
    jitter_ms = _to_milliseconds(float(row.get("jitter", row.get("jitter_ms", 0.0))))
    if jitter_ms < 10:
        return 0.0
    if jitter_ms <= 30:
        return ((jitter_ms - 10.0) / 20.0) * 0.3
    if jitter_ms <= 80:
        return 0.3 + ((jitter_ms - 30.0) / 50.0) * 0.5
    return 1.0


def _freeze_penalty(row: dict[str, Any]) -> float:
    freeze_rate = float(row.get("freezeRatePerMin", row.get("freeze_rate_per_min", 0.0)))
    if freeze_rate <= 0.0:
        return 0.0
    if freeze_rate <= 2.0:
        return 0.15
    if freeze_rate <= 5.0:
        return 0.35
    return 0.6


def _implicit_feedback_label(row: dict[str, Any]) -> float:
    muted = 1.0 if row.get("did_user_mute") or row.get("user_muted") else 0.0
    left_early = 1.0 if row.get("left_early") or row.get("did_leave_early") else 0.0
    complaint = 1.0 if row.get("resolution_complaint") or row.get("complaint_event") else 0.0
    interruption = 1.0 if row.get("freezeCount", 0) or row.get("freeze_count", 0) else 0.0
    base = 0.92
    penalty = 0.18 * muted + 0.42 * left_early + 0.28 * complaint + 0.12 * interruption
    return _clamp(base - penalty, 0.0, 1.0)


@dataclass(slots=True)
class TrainingBatch:
    features: np.ndarray
    labels: np.ndarray


class WebRTCModelTrainer:
    def __init__(self, local_data: list[dict[str, Any]], current_global_weights: np.ndarray):
        self.local_data = local_data[-MAX_LOCAL_SAMPLES:]
        self.current_global_weights = np.asarray(current_global_weights, dtype=np.float32).reshape(5)
        self._rng = np.random.default_rng()
        self.batch = self._build_batch(self.local_data)

    def _build_batch(self, local_data: list[dict[str, Any]]) -> TrainingBatch:
        if not local_data:
            return TrainingBatch(
                features=np.zeros((1, 5), dtype=np.float32),
                labels=np.zeros((1,), dtype=np.float32),
            )

        feature_rows: list[list[float]] = []
        labels: list[float] = []
        for row in local_data:
            q_video = _video_quality(row)
            q_audio = _audio_quality(row)
            rtt_penalty = _rtt_penalty(row)
            jitter_penalty = _jitter_penalty(row)
            freeze_penalty = _freeze_penalty(row)
            feature_rows.append(
                [
                    q_video,
                    q_audio,
                    -rtt_penalty,
                    -jitter_penalty,
                    -freeze_penalty,
                ]
            )
            labels.append(_implicit_feedback_label(row))

        return TrainingBatch(
            features=np.asarray(feature_rows, dtype=np.float32),
            labels=np.asarray(labels, dtype=np.float32),
        )

    def compute_loss(self, weights: np.ndarray) -> float:
        weights_arr = np.asarray(weights, dtype=np.float32).reshape(5)
        predictions = self.batch.features @ weights_arr
        errors = predictions - self.batch.labels
        return float(np.mean(np.square(errors)))

    def train(self) -> np.ndarray:
        weights = self.current_global_weights.copy()
        sample_count = float(max(len(self.batch.labels), 1))

        for _ in range(LOCAL_EPOCHS):
            predictions = self.batch.features @ weights
            residual = predictions - self.batch.labels
            gradient = (2.0 / sample_count) * (self.batch.features.T @ residual)
            weights = weights - LEARNING_RATE * gradient.astype(np.float32)

        update = weights - self.current_global_weights
        norm = float(np.linalg.norm(update))
        if norm > DP_CLIP_NORM:
            update = update * (DP_CLIP_NORM / (norm + 1e-8))

        noise = self._rng.normal(0.0, DP_SIGMA * DP_CLIP_NORM, size=update.shape).astype(np.float32)
        return update.astype(np.float32) + noise
