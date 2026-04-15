import { KafkaPublisher } from '../core/KafkaPublisher';
import { EMPTY_WEBRTC_METRICS, type CongestionPrediction, type WebRTCMetrics } from './types';
import { ReceiverSRAgent } from './ReceiverSRAgent';

interface StatsLike {
  type?: string;
  kind?: string;
  mediaType?: string;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  bytesReceived?: number;
  packetsLost?: number;
  packetsReceived?: number;
  packetsSent?: number;
  jitter?: number;
  totalFreezesDuration?: number;
  freezeCount?: number;
  qualityLimitationReason?: string;
  pliCount?: number;
  nackCount?: number;
  audioLevel?: number;
  jitterBufferDelay?: number;
  concealedSamples?: number;
  totalSamplesReceived?: number;
  concealmentEvents?: number;
  echoReturnLoss?: number;
  currentRoundTripTime?: number;
  availableOutgoingBitrate?: number;
  bytesSent?: number;
}

interface MetricsSnapshot {
  videoBytes: number;
  packetsLost: number;
  packetsExpected: number;
  capturedAt: number;
}

function asStats(entry: unknown): StatsLike {
  return (entry ?? {}) as StatsLike;
}

function getNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class WebRTCTelemetryAgent {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private latestMetrics: WebRTCMetrics = { ...EMPTY_WEBRTC_METRICS };
  private latestPrediction: CongestionPrediction | null = null;
  private srAgent: ReceiverSRAgent | null = null;
  private previousSnapshot: MetricsSnapshot | null = null;
  private readonly startedAt = Date.now();

  constructor(
    private readonly peerConnection: RTCPeerConnection,
    private readonly participantId: string,
    private readonly sessionId: string,
    private readonly kafkaPublisher: KafkaPublisher
  ) {}

  start(): void {
    if (this.intervalId) {
      return;
    }

    void this.poll();
    this.intervalId = setInterval(() => {
      void this.poll();
    }, 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    void this.publishMetrics(this.latestMetrics);
  }

  destroy(): void {
    this.stop();
  }

  getLatestMetrics(): WebRTCMetrics {
    return this.latestMetrics;
  }

  setLatestPrediction(prediction: CongestionPrediction | null): void {
    this.latestPrediction = prediction;
  }

  setSRAgent(srAgent: ReceiverSRAgent): void {
    this.srAgent = srAgent;
  }

  private async poll(): Promise<void> {
    try {
      const report = await this.peerConnection.getStats();
      const now = Date.now();

      let videoInbound: StatsLike | null = null;
      let audioInbound: StatsLike | null = null;
      let videoOutbound: StatsLike | null = null;
      let audioOutbound: StatsLike | null = null;
      let candidatePair: StatsLike | null = null;

      report.forEach((entry) => {
        const stats = asStats(entry);
        if (stats.type === 'inbound-rtp' && (stats.kind === 'video' || stats.mediaType === 'video')) {
          videoInbound = stats;
          return;
        }

        if (stats.type === 'inbound-rtp' && (stats.kind === 'audio' || stats.mediaType === 'audio')) {
          audioInbound = stats;
          return;
        }

        if (stats.type === 'outbound-rtp' && (stats.kind === 'video' || stats.mediaType === 'video')) {
          videoOutbound = stats;
          return;
        }

        if (stats.type === 'outbound-rtp' && (stats.kind === 'audio' || stats.mediaType === 'audio')) {
          audioOutbound = stats;
          return;
        }

        if (stats.type === 'candidate-pair') {
          const hasTraffic =
            getNumber(stats.bytesSent) > 0 ||
            getNumber(stats.bytesReceived) > 0 ||
            getNumber(stats.currentRoundTripTime) > 0;
          if (hasTraffic) {
            candidatePair = stats;
          }
        }
      });

      const videoStats: StatsLike = videoInbound ?? videoOutbound ?? {};
      const audioStats: StatsLike = audioInbound ?? audioOutbound ?? {};
      const candidatePairStats: StatsLike = candidatePair ?? {};

      const isVideoInbound = Boolean(videoInbound);
      const currentBytes = isVideoInbound
        ? getNumber(videoStats.bytesReceived)
        : getNumber(videoStats.bytesSent);
      const currentPacketsLost = getNumber(videoStats.packetsLost);
      const currentPacketsReceived = getNumber(videoStats.packetsReceived) || getNumber(videoStats.packetsSent);
      const currentPacketsExpected = currentPacketsReceived + currentPacketsLost;

      const intervalSeconds = this.previousSnapshot
        ? Math.max((now - this.previousSnapshot.capturedAt) / 1000, 1)
        : 1;
      const bytesDelta = this.previousSnapshot
        ? Math.max(currentBytes - this.previousSnapshot.videoBytes, 0)
        : 0;
      const packetsLostDelta = this.previousSnapshot
        ? Math.max(currentPacketsLost - this.previousSnapshot.packetsLost, 0)
        : 0;
      const packetsExpectedDelta = this.previousSnapshot
        ? Math.max(currentPacketsExpected - this.previousSnapshot.packetsExpected, 0)
        : 0;

      const freezeCount = getNumber(videoStats.freezeCount);
      const elapsedSeconds = Math.max((now - this.startedAt) / 1000, 1);
      const totalSamplesReceived = getNumber(audioStats.totalSamplesReceived);
      const concealedSamples = getNumber(audioStats.concealedSamples);

      const baseMetrics: WebRTCMetrics = {
        frameWidth: getNumber(videoStats.frameWidth),
        frameHeight: getNumber(videoStats.frameHeight),
        framesPerSecond: getNumber(videoStats.framesPerSecond),
        bytesReceived: currentBytes,
        videoBitrateKbps: (bytesDelta * 8) / 1000 / intervalSeconds,
        packetsLost: currentPacketsLost,
        packetLossRate: packetsExpectedDelta > 0 ? packetsLostDelta / packetsExpectedDelta : 0,
        jitter: getNumber(videoStats.jitter),
        totalFreezesDuration: getNumber(videoStats.totalFreezesDuration),
        freezeCount,
        freezeRatePerMin: freezeCount / (elapsedSeconds / 60),
        qualityLimitationReason: videoStats.qualityLimitationReason ?? 'none',
        pliCount: getNumber(videoStats.pliCount),
        nackCount: getNumber(videoStats.nackCount),
        audioLevel: getNumber(audioStats.audioLevel),
        jitterBufferDelay: getNumber(audioStats.jitterBufferDelay),
        concealedSamples,
        totalSamplesReceived,
        concealedSamplesRatio: totalSamplesReceived > 0 ? concealedSamples / totalSamplesReceived : 0,
        concealmentEvents: getNumber(audioStats.concealmentEvents),
        echoReturnLoss: getNumber(audioStats.echoReturnLoss),
        currentRoundTripTime: getNumber(candidatePairStats.currentRoundTripTime),
        availableOutgoingBitrate: getNumber(candidatePairStats.availableOutgoingBitrate),
        networkBytesSent: getNumber(candidatePairStats.bytesSent),
        networkBytesReceived: getNumber(candidatePairStats.bytesReceived),
        perceptualQualityScore: null,
        receiverSrActive: false,
      };

      const nextMetrics: WebRTCMetrics = {
        ...baseMetrics,
        perceptualQualityScore:
          this.srAgent?.getLatestBRISQUEScore() ?? this.estimatePerceptualQualityScore(baseMetrics),
        receiverSrActive: this.srAgent?.isCurrentlyActive() ?? baseMetrics.receiverSrActive,
      };

      this.latestMetrics = nextMetrics;
      this.previousSnapshot = {
        videoBytes: currentBytes,
        packetsLost: currentPacketsLost,
        packetsExpected: currentPacketsExpected,
        capturedAt: now,
      };

      await this.publishMetrics(nextMetrics);
    } catch (error) {
      console.warn('[MobCloudX] WebRTC telemetry poll failed:', error);
    }
  }

  private estimatePerceptualQualityScore(metrics: WebRTCMetrics): number {
    const fpsComponent = clamp(metrics.framesPerSecond / 30, 0, 1);
    const bitrateComponent = clamp(metrics.videoBitrateKbps / 1800, 0, 1);
    const packetLossPenalty = clamp(metrics.packetLossRate * 3, 0, 1);
    const freezePenalty = clamp(metrics.freezeRatePerMin / 6, 0, 1);
    const rttMs = metrics.currentRoundTripTime > 10
      ? metrics.currentRoundTripTime
      : metrics.currentRoundTripTime * 1000;
    const rttPenalty = clamp(rttMs / 600, 0, 1);

    const score =
      0.38 * fpsComponent +
      0.34 * bitrateComponent +
      0.28 * (1 - packetLossPenalty) -
      0.16 * freezePenalty -
      0.12 * rttPenalty;

    return clamp(score, 0, 1);
  }

  private async publishMetrics(metrics: WebRTCMetrics): Promise<void> {
    const payload = {
      topic: 'webrtc-telemetry',
      messages: [
        {
          key: this.participantId,
          value: JSON.stringify({
            session_id: this.sessionId,
            participant_id: this.participantId,
            timestamp: Date.now(),
            ...metrics,
            sr_active: this.srAgent?.isCurrentlyActive() ?? metrics.receiverSrActive,
            brisque_score:
              (this.srAgent?.getLatestBRISQUEScore() ?? metrics.perceptualQualityScore) !== null
                ? Math.round(((this.srAgent?.getLatestBRISQUEScore() ?? metrics.perceptualQualityScore ?? 0) * 100) * 100) / 100
                : null,
            sr_frames_processed: this.srAgent?.framesProcessedCount ?? 0,
            congestion_probability: this.latestPrediction?.congestionProbability ?? null,
            predicted_bitrate_kbps: this.latestPrediction?.predictedBitrateKbps ?? null,
            prediction_warning_level: this.latestPrediction?.warningLevel ?? 'none',
            prediction_confidence: this.latestPrediction?.confidenceLevel ?? 'low',
            sdk_version: '2.0.0',
            mode: 'webrtc',
          }),
        },
      ],
    };

    await this.kafkaPublisher.publish('webrtc-telemetry', payload);
  }
}
