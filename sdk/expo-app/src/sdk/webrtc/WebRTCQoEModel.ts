import type { QoEResult, QoEWeights, WebRTCMetrics } from './types';

export const QoEThresholds = {
  fpsReference: 30,
  audioJitterBufferMaxSeconds: 0.15,
  resolutionScores: {
    '2160p': 1.0,
    '1440p': 0.85,
    '1080p': 0.75,
    '720p': 0.6,
    '480p': 0.4,
    '360p': 0.25,
    '240p': 0.1,
  },
  rttPenalty: {
    excellentMs: 50,
    fairMs: 150,
    poorMs: 300,
    criticalMs: 500,
  },
  jitterPenalty: {
    excellentMs: 10,
    fairMs: 30,
    poorMs: 80,
  },
  freezePenalty: {
    lowPerMin: 1,
    mediumPerMin: 3,
    highPerMin: 5,
  },
  fsm: {
    hdRttMs: 100,
    hdPacketLossRate: 0.01,
    hdFps: 25,
    bandwidthBitrateBps: 800000,
    bandwidthQoeScore: 70,
    highLatencyRttMs: 200,
    highLatencyPacketLossRate: 0.03,
    packetLossRate: 0.05,
    packetLossPliCount: 5,
    recoveryRttMs: 150,
    recoveryPacketLossRate: 0.02,
    recoveryFps: 20,
    debounceCount: 3,
  },
} as const;

const DEFAULT_WEIGHTS: QoEWeights = {
  alpha: 0.35,
  beta: 0.35,
  gamma: 0.15,
  delta: 0.1,
  epsilon: 0.05,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeMilliseconds(value: number): number {
  if (value <= 0) {
    return 0;
  }

  return value < 10 ? value * 1000 : value;
}

function getResolutionKey(frameHeight: number): keyof typeof QoEThresholds.resolutionScores {
  if (frameHeight >= 2160) return '2160p';
  if (frameHeight >= 1440) return '1440p';
  if (frameHeight >= 1080) return '1080p';
  if (frameHeight >= 720) return '720p';
  if (frameHeight >= 480) return '480p';
  if (frameHeight >= 360) return '360p';
  return '240p';
}

function computeVideoScore(metrics: WebRTCMetrics): number {
  const fpsComponent = clamp(metrics.framesPerSecond / QoEThresholds.fpsReference, 0, 1);
  const packetLossComponent = clamp(1 - metrics.packetLossRate, 0, 1);
  const resolutionScore = QoEThresholds.resolutionScores[getResolutionKey(metrics.frameHeight)];
  const originalScore = clamp(
    0.4 * fpsComponent + 0.35 * packetLossComponent + 0.25 * resolutionScore,
    0,
    1
  );

  if (typeof metrics.perceptualQualityScore === 'number') {
    const perceptualScore = clamp(metrics.perceptualQualityScore, 0, 1);
    return clamp(0.5 * originalScore + 0.5 * perceptualScore, 0, 1);
  }

  return originalScore;
}

function computeAudioScore(metrics: WebRTCMetrics): number {
  const concealmentComponent = clamp(1 - metrics.concealedSamplesRatio, 0, 1);
  const jitterBufferComponent = Math.max(
    0,
    1 - metrics.jitterBufferDelay / QoEThresholds.audioJitterBufferMaxSeconds
  );

  return clamp(0.6 * concealmentComponent + 0.4 * jitterBufferComponent, 0, 1);
}

function computeRttPenalty(currentRoundTripTime: number): number {
  const rttMs = normalizeMilliseconds(currentRoundTripTime);

  if (rttMs < 50) return 0;
  if (rttMs <= 150) return ((rttMs - 50) / 100) * 0.3;
  if (rttMs <= 300) return 0.3 + ((rttMs - 150) / 150) * 0.5;
  if (rttMs <= 500) return 0.8 + ((rttMs - 300) / 200) * 0.2;
  return 1.0;
}

function computeJitterPenalty(jitter: number): number {
  const jitterMs = normalizeMilliseconds(jitter);

  if (jitterMs < 10) return 0;
  if (jitterMs <= 30) return ((jitterMs - 10) / 20) * 0.3;
  if (jitterMs <= 80) return 0.3 + ((jitterMs - 30) / 50) * 0.5;
  return 1.0;
}

function computeFreezePenalty(freezeRatePerMin: number): number {
  if (freezeRatePerMin <= 0) return 0;
  if (freezeRatePerMin <= 2) return 0.15;
  if (freezeRatePerMin <= 5) return 0.35;
  return 0.6;
}

export function extractQoEFeatureVector(metrics: WebRTCMetrics): [number, number, number, number, number] {
  return [
    computeVideoScore(metrics),
    computeAudioScore(metrics),
    -computeRttPenalty(metrics.currentRoundTripTime),
    -computeJitterPenalty(metrics.jitter),
    -computeFreezePenalty(metrics.freezeRatePerMin),
  ];
}

function getDominantIssue(
  metrics: WebRTCMetrics,
  audioScore: number,
  rttPenalty: number,
  jitterPenalty: number,
  freezePenalty: number
): QoEResult['dominantIssue'] {
  const candidates: Array<{ issue: QoEResult['dominantIssue']; value: number }> = [
    { issue: 'rtt', value: rttPenalty },
    { issue: 'jitter', value: jitterPenalty },
    { issue: 'packet_loss', value: clamp(metrics.packetLossRate, 0, 1) },
    { issue: 'freeze', value: freezePenalty },
    { issue: 'audio', value: clamp(1 - audioScore, 0, 1) },
  ];

  const dominant = candidates.reduce((highest, current) =>
    current.value > highest.value ? current : highest
  );

  return dominant.value < 0.05 ? 'none' : dominant.issue;
}

export class WebRTCQoEModel {
  private weights: QoEWeights;

  constructor(weights?: Partial<QoEWeights>) {
    this.weights = { ...DEFAULT_WEIGHTS, ...weights };
  }

  compute(metrics: WebRTCMetrics): QoEResult {
    const videoScore = computeVideoScore(metrics);
    const audioScore = computeAudioScore(metrics);
    const rttPenalty = computeRttPenalty(metrics.currentRoundTripTime);
    const jitterPenalty = computeJitterPenalty(metrics.jitter);
    const freezePenalty = computeFreezePenalty(metrics.freezeRatePerMin);

    const rtcScore =
      this.weights.alpha * videoScore +
      this.weights.beta * audioScore -
      this.weights.gamma * rttPenalty -
      this.weights.delta * jitterPenalty -
      this.weights.epsilon * freezePenalty;

    return {
      score: clamp(rtcScore * 100, 0, 100),
      videoScore,
      audioScore,
      rttPenalty,
      jitterPenalty,
      freezePenalty,
      brisqueScore: metrics.perceptualQualityScore !== null ? metrics.perceptualQualityScore * 100 : null,
      srActive: metrics.receiverSrActive,
      dominantIssue: getDominantIssue(metrics, audioScore, rttPenalty, jitterPenalty, freezePenalty),
    };
  }

  updateWeights(weights: Partial<QoEWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  getWeights(): QoEWeights {
    return { ...this.weights };
  }
}

export function getResolutionLabel(frameHeight: number): string {
  return getResolutionKey(frameHeight);
}

export function toMilliseconds(value: number): number {
  return normalizeMilliseconds(value);
}
