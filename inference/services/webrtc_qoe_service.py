from __future__ import annotations

import math
import os
from datetime import UTC, datetime
from statistics import mean, median
from typing import Any, Literal

from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field


class QoEWeights(BaseModel):
    alpha: float = 0.35
    beta: float = 0.35
    gamma: float = 0.15
    delta: float = 0.10
    epsilon: float = 0.05


QoEDominantIssue = Literal["rtt", "jitter", "packet_loss", "freeze", "audio", "none"]


class WebRTCTelemetryDoc(BaseModel):
    session_id: str
    participant_id: str
    timestamp: datetime
    frameWidth: float = 0
    frameHeight: float = 0
    framesPerSecond: float = 0
    bytesReceived: float = 0
    videoBitrateKbps: float = 0
    packetsLost: float = 0
    packetLossRate: float = 0
    jitter: float = 0
    totalFreezesDuration: float = 0
    freezeCount: int = 0
    freezeRatePerMin: float = 0
    qualityLimitationReason: str = "none"
    pliCount: int = 0
    nackCount: int = 0
    audioLevel: float = 0
    jitterBufferDelay: float = 0
    concealedSamples: float = 0
    totalSamplesReceived: float = 0
    concealedSamplesRatio: float = 0
    concealmentEvents: float = 0
    echoReturnLoss: float = 0
    currentRoundTripTime: float = 0
    availableOutgoingBitrate: float = 0
    networkBytesSent: float = 0
    networkBytesReceived: float = 0
    fsm_state: str | None = None


class WebRTCQoEResult(BaseModel):
    session_id: str
    participant_id: str
    timestamp: datetime
    score: float
    videoScore: float
    audioScore: float
    rttPenalty: float
    jitterPenalty: float
    freezePenalty: float
    dominantIssue: QoEDominantIssue


class QoETimelinePoint(BaseModel):
    timestamp: datetime
    qoe_score: float
    fsm_state: str


class ParticipantAggregation(BaseModel):
    participant_id: str
    avg_qoe: float
    timeline: list[QoETimelinePoint] = Field(default_factory=list)


class WebRTCSessionSummary(BaseModel):
    session_id: str
    avg_qoe: float
    p10_qoe: float
    p50_qoe: float
    p90_qoe: float
    sla_compliance: bool
    dominant_issue_distribution: dict[str, int]
    qoe_timeline: list[QoETimelinePoint]
    session_qoe: float
    weakest_participant: str | None
    qoe_variance: float
    participant_aggregations: list[ParticipantAggregation]


class WebRTCQoEService:
    RESOLUTION_SCORES: dict[str, float] = {
        "2160p": 1.0,
        "1440p": 0.85,
        "1080p": 0.75,
        "720p": 0.60,
        "480p": 0.40,
        "360p": 0.25,
        "240p": 0.10,
    }

    SLA_THRESHOLD = float(os.getenv("WEBRTC_QOE_SLA_THRESHOLD", "70"))

    def __init__(self, database: AsyncIOMotorDatabase) -> None:
        self.database = database
        self.weights = QoEWeights()

    async def compute_realtime_qoe(self, telemetry: WebRTCTelemetryDoc) -> WebRTCQoEResult:
        video_score = self._compute_video_score(telemetry)
        audio_score = self._compute_audio_score(telemetry)
        rtt_penalty = self._compute_rtt_penalty(telemetry.currentRoundTripTime)
        jitter_penalty = self._compute_jitter_penalty(telemetry.jitter)
        freeze_penalty = self._compute_freeze_penalty(telemetry.freezeRatePerMin)
        qoe_rtc = (
            self.weights.alpha * video_score
            + self.weights.beta * audio_score
            - self.weights.gamma * rtt_penalty
            - self.weights.delta * jitter_penalty
            - self.weights.epsilon * freeze_penalty
        )
        score = self._clamp(qoe_rtc * 100, 0, 100)
        dominant_issue = self._dominant_issue(
            packet_loss_rate=telemetry.packetLossRate,
            audio_score=audio_score,
            rtt_penalty=rtt_penalty,
            jitter_penalty=jitter_penalty,
            freeze_penalty=freeze_penalty,
        )

        return WebRTCQoEResult(
            session_id=telemetry.session_id,
            participant_id=telemetry.participant_id,
            timestamp=telemetry.timestamp,
            score=score,
            videoScore=video_score,
            audioScore=audio_score,
            rttPenalty=rtt_penalty,
            jitterPenalty=jitter_penalty,
            freezePenalty=freeze_penalty,
            dominantIssue=dominant_issue,
        )

    async def compute_session_summary(self, session_id: str) -> WebRTCSessionSummary:
        pipeline = [
            {"$match": {"session_id": session_id}},
            {
                "$project": {
                    "_id": 0,
                    "session_id": 1,
                    "participant_id": 1,
                    "timestamp": 1,
                    "frameWidth": {"$ifNull": ["$frameWidth", 0]},
                    "frameHeight": {"$ifNull": ["$frameHeight", 0]},
                    "framesPerSecond": {"$ifNull": ["$framesPerSecond", {"$ifNull": ["$fps", 0]}]},
                    "packetsLost": {"$ifNull": ["$packetsLost", 0]},
                    "packetLossRate": {"$ifNull": ["$packetLossRate", {"$ifNull": ["$packet_loss_rate", 0]}]},
                    "jitter": {"$ifNull": ["$jitter", {"$ifNull": ["$jitter_ms", 0]}]},
                    "freezeCount": {"$ifNull": ["$freezeCount", {"$ifNull": ["$freeze_count", 0]}]},
                    "freezeRatePerMin": {"$ifNull": ["$freezeRatePerMin", 0]},
                    "qualityLimitationReason": {"$ifNull": ["$qualityLimitationReason", "none"]},
                    "pliCount": {"$ifNull": ["$pliCount", 0]},
                    "jitterBufferDelay": {"$ifNull": ["$jitterBufferDelay", 0]},
                    "concealedSamplesRatio": {"$ifNull": ["$concealedSamplesRatio", 0]},
                    "currentRoundTripTime": {"$ifNull": ["$currentRoundTripTime", {"$ifNull": ["$rtt_ms", 0]}]},
                    "availableOutgoingBitrate": {"$ifNull": ["$availableOutgoingBitrate", {"$ifNull": ["$available_bitrate_kbps", 0]}]},
                    "fsm_state": {"$ifNull": ["$fsm_state", "Recovery"]},
                }
            },
            {"$sort": {"timestamp": 1}},
        ]
        documents = await self.database["webrtc_telemetry"].aggregate(pipeline).to_list(length=None)
        if not documents:
            return WebRTCSessionSummary(
                session_id=session_id,
                avg_qoe=0,
                p10_qoe=0,
                p50_qoe=0,
                p90_qoe=0,
                sla_compliance=False,
                dominant_issue_distribution={},
                qoe_timeline=[],
                session_qoe=0,
                weakest_participant=None,
                qoe_variance=0,
                participant_aggregations=[],
            )

        computed_points: list[tuple[WebRTCQoEResult, str]] = []
        dominant_issue_distribution: dict[str, int] = {}
        participant_buckets: dict[str, list[tuple[datetime, float, str]]] = {}
        for document in documents:
            telemetry_doc = WebRTCTelemetryDoc(**document)
            result = await self.compute_realtime_qoe(telemetry_doc)
            dominant_issue_distribution[result.dominantIssue] = dominant_issue_distribution.get(result.dominantIssue, 0) + 1
            fsm_state = str(document.get("fsm_state", "Recovery"))
            computed_points.append((result, fsm_state))
            participant_buckets.setdefault(result.participant_id, []).append((result.timestamp, result.score, fsm_state))

        all_scores = [result.score for result, _ in computed_points]
        participant_aggregations = [
            ParticipantAggregation(
                participant_id=participant_id,
                avg_qoe=round(mean(score for _, score, _ in entries), 2),
                timeline=self._downsample_timeline(entries, 5),
            )
            for participant_id, entries in participant_buckets.items()
        ]

        participants_doc = await self.database["webrtc_sessions"].find_one(
            {"session_id": session_id},
            {"_id": 0, "participants": 1},
        )
        participants = list((participants_doc or {}).get("participants", []))
        session_qoe = self._weighted_session_qoe(participants, participant_aggregations)
        weakest_participant = min(participant_aggregations, key=lambda item: item.avg_qoe).participant_id if participant_aggregations else None
        qoe_variance = self._std_dev([item.avg_qoe for item in participant_aggregations])

        return WebRTCSessionSummary(
            session_id=session_id,
            avg_qoe=round(mean(all_scores), 2),
            p10_qoe=round(self._percentile(all_scores, 10), 2),
            p50_qoe=round(self._percentile(all_scores, 50), 2),
            p90_qoe=round(self._percentile(all_scores, 90), 2),
            sla_compliance=mean(all_scores) >= self.SLA_THRESHOLD,
            dominant_issue_distribution=dominant_issue_distribution,
            qoe_timeline=self._downsample_timeline(
                [(result.timestamp, result.score, fsm_state) for result, fsm_state in computed_points],
                5,
            ),
            session_qoe=round(session_qoe, 2),
            weakest_participant=weakest_participant,
            qoe_variance=round(qoe_variance, 2),
            participant_aggregations=participant_aggregations,
        )

    async def get_participant_timeline(
        self,
        session_id: str,
        participant_id: str,
        downsample_seconds: int = 5,
    ) -> list[QoETimelinePoint]:
        documents = await self.database["webrtc_telemetry"].find(
            {"session_id": session_id, "participant_id": participant_id},
            {"_id": 0},
        ).sort("timestamp", 1).to_list(length=None)

        scored_points: list[tuple[datetime, float, str]] = []
        for document in documents:
            telemetry_doc = WebRTCTelemetryDoc(**document)
            result = await self.compute_realtime_qoe(telemetry_doc)
            scored_points.append((result.timestamp, result.score, str(document.get("fsm_state", "Recovery"))))

        return self._downsample_timeline(scored_points, downsample_seconds)

    def _compute_video_score(self, telemetry: WebRTCTelemetryDoc) -> float:
        fps_component = self._clamp(telemetry.framesPerSecond / 30, 0, 1)
        packet_loss_component = self._clamp(1 - telemetry.packetLossRate, 0, 1)
        resolution_score = self.RESOLUTION_SCORES[self._resolution_key(telemetry.frameHeight)]
        return self._clamp(0.4 * fps_component + 0.35 * packet_loss_component + 0.25 * resolution_score, 0, 1)

    def _compute_audio_score(self, telemetry: WebRTCTelemetryDoc) -> float:
        concealment_component = self._clamp(1 - telemetry.concealedSamplesRatio, 0, 1)
        jitter_buffer_component = max(0.0, 1 - telemetry.jitterBufferDelay / 0.15)
        return self._clamp(0.6 * concealment_component + 0.4 * jitter_buffer_component, 0, 1)

    @staticmethod
    def _normalize_milliseconds(value: float) -> float:
        if value <= 0:
            return 0
        return value * 1000 if value < 10 else value

    def _compute_rtt_penalty(self, value: float) -> float:
        rtt_ms = self._normalize_milliseconds(value)
        if rtt_ms < 50:
            return 0
        if rtt_ms <= 150:
            return ((rtt_ms - 50) / 100) * 0.3
        if rtt_ms <= 300:
            return 0.3 + ((rtt_ms - 150) / 150) * 0.5
        if rtt_ms <= 500:
            return 0.8 + ((rtt_ms - 300) / 200) * 0.2
        return 1.0

    def _compute_jitter_penalty(self, value: float) -> float:
        jitter_ms = self._normalize_milliseconds(value)
        if jitter_ms < 10:
            return 0
        if jitter_ms <= 30:
            return ((jitter_ms - 10) / 20) * 0.3
        if jitter_ms <= 80:
            return 0.3 + ((jitter_ms - 30) / 50) * 0.5
        return 1.0

    @staticmethod
    def _compute_freeze_penalty(freeze_rate_per_min: float) -> float:
        if freeze_rate_per_min <= 0:
            return 0
        if freeze_rate_per_min <= 2:
            return 0.15
        if freeze_rate_per_min <= 5:
            return 0.35
        return 0.6

    @staticmethod
    def _clamp(value: float, lower: float, upper: float) -> float:
        return min(upper, max(lower, value))

    def _resolution_key(self, frame_height: float) -> str:
        if frame_height >= 2160:
            return "2160p"
        if frame_height >= 1440:
            return "1440p"
        if frame_height >= 1080:
            return "1080p"
        if frame_height >= 720:
            return "720p"
        if frame_height >= 480:
            return "480p"
        if frame_height >= 360:
            return "360p"
        return "240p"

    @staticmethod
    def _dominant_issue(
        packet_loss_rate: float,
        audio_score: float,
        rtt_penalty: float,
        jitter_penalty: float,
        freeze_penalty: float,
    ) -> QoEDominantIssue:
        candidates: list[tuple[QoEDominantIssue, float]] = [
            ("rtt", rtt_penalty),
            ("jitter", jitter_penalty),
            ("packet_loss", max(0, min(packet_loss_rate, 1))),
            ("freeze", freeze_penalty),
            ("audio", max(0, min(1 - audio_score, 1))),
        ]
        issue, value = max(candidates, key=lambda item: item[1])
        return "none" if value < 0.05 else issue

    @staticmethod
    def _percentile(values: list[float], percentile: int) -> float:
        if not values:
            return 0
        ordered = sorted(values)
        rank = (len(ordered) - 1) * (percentile / 100)
        lower = math.floor(rank)
        upper = math.ceil(rank)
        if lower == upper:
            return ordered[int(rank)]
        weight = rank - lower
        return ordered[lower] * (1 - weight) + ordered[upper] * weight

    @staticmethod
    def _std_dev(values: list[float]) -> float:
        if len(values) <= 1:
            return 0
        center = mean(values)
        return math.sqrt(sum((value - center) ** 2 for value in values) / len(values))

    def _weighted_session_qoe(
        self,
        participants: list[str],
        aggregations: list[ParticipantAggregation],
    ) -> float:
        if not aggregations:
            return 0
        aggregation_map = {item.participant_id: item.avg_qoe for item in aggregations}
        if len(participants) == 4:
            host_id = participants[0]
            score = 0.0
            total_weight = 0.0
            for participant_id in participants:
                weight = 0.4 if participant_id == host_id else 0.2
                if participant_id in aggregation_map:
                    score += aggregation_map[participant_id] * weight
                    total_weight += weight
            return score / total_weight if total_weight else 0
        return mean(aggregation_map.values())

    @staticmethod
    def _downsample_timeline(
        entries: list[tuple[datetime, float, str]],
        downsample_seconds: int,
    ) -> list[QoETimelinePoint]:
        downsampled: list[QoETimelinePoint] = []
        current_bucket: tuple[datetime, float, str] | None = None
        for timestamp, qoe_score, fsm_state in entries:
            if current_bucket is None:
                current_bucket = (timestamp, qoe_score, fsm_state)
                continue
            if (timestamp - current_bucket[0]).total_seconds() >= downsample_seconds:
                downsampled.append(
                    QoETimelinePoint(
                        timestamp=current_bucket[0],
                        qoe_score=round(current_bucket[1], 2),
                        fsm_state=current_bucket[2],
                    )
                )
                current_bucket = (timestamp, qoe_score, fsm_state)
        if current_bucket is not None:
            downsampled.append(
                QoETimelinePoint(
                    timestamp=current_bucket[0],
                    qoe_score=round(current_bucket[1], 2),
                    fsm_state=current_bucket[2],
                )
            )
        return downsampled
