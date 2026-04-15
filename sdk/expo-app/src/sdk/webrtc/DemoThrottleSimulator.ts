import type { WebRTCMetrics } from './types';

export type ThrottleLevel =
  | 'NONE'
  | 'MILD_4G'
  | 'DEGRADED_4G'
  | 'POOR_3G'
  | 'CONGESTED';

export type MetricsInterceptor = (metrics: WebRTCMetrics, participantId?: string) => WebRTCMetrics;

interface ThrottleProfile {
  rtt_multiplier: number;
  plr_additive: number;
  bitrate_multiplier: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class DemoThrottleSimulator {
  private isActive = false;
  private throttleLevel: ThrottleLevel = 'NONE';
  private originalMetricsInterceptor: MetricsInterceptor | null = null;
  private targetParticipantId: string | null = null;

  static readonly LEVELS: Record<ThrottleLevel, ThrottleProfile> = {
    NONE: { rtt_multiplier: 1, plr_additive: 0, bitrate_multiplier: 1 },
    MILD_4G: { rtt_multiplier: 2, plr_additive: 0.01, bitrate_multiplier: 0.6 },
    DEGRADED_4G: { rtt_multiplier: 3.5, plr_additive: 0.04, bitrate_multiplier: 0.35 },
    POOR_3G: { rtt_multiplier: 6, plr_additive: 0.08, bitrate_multiplier: 0.15 },
    CONGESTED: { rtt_multiplier: 10, plr_additive: 0.15, bitrate_multiplier: 0.08 },
  };

  activate(level: ThrottleLevel): void {
    this.throttleLevel = level;
    this.isActive = level !== 'NONE';
  }

  deactivate(): void {
    this.isActive = false;
    this.throttleLevel = 'NONE';
  }

  setTargetParticipant(participantId: string | null): void {
    this.targetParticipantId = participantId;
  }

  getCurrentLevel(): ThrottleLevel {
    return this.throttleLevel;
  }

  isEnabled(): boolean {
    return this.isActive;
  }

  setOriginalInterceptor(interceptor: MetricsInterceptor | null): void {
    this.originalMetricsInterceptor = interceptor;
  }

  interceptMetrics(realMetrics: WebRTCMetrics, participantId?: string): WebRTCMetrics {
    const baseMetrics = this.originalMetricsInterceptor
      ? this.originalMetricsInterceptor(realMetrics, participantId)
      : realMetrics;

    if (
      !this.isActive ||
      this.throttleLevel === 'NONE' ||
      (this.targetParticipantId !== null && participantId !== this.targetParticipantId)
    ) {
      return baseMetrics;
    }

    const profile = DemoThrottleSimulator.LEVELS[this.throttleLevel];
    const packetLossRate = clamp(baseMetrics.packetLossRate + profile.plr_additive, 0, 0.5);
    const bitrateMultiplier = clamp(profile.bitrate_multiplier, 0.05, 1);
    const fpsMultiplier = clamp(Math.sqrt(bitrateMultiplier), 0.25, 1);
    const simulatedFreezeRate = clamp(
      baseMetrics.freezeRatePerMin + profile.plr_additive * 40 + Math.max(profile.rtt_multiplier - 1, 0) * 0.35,
      0,
      12
    );
    const simulatedFreezeCount = Math.max(
      baseMetrics.freezeCount,
      Math.round(simulatedFreezeRate * (1 / 60))
    );

    return {
      ...baseMetrics,
      currentRoundTripTime: baseMetrics.currentRoundTripTime * profile.rtt_multiplier,
      jitter: baseMetrics.jitter * Math.max(1.2, profile.rtt_multiplier * 0.4),
      packetLossRate,
      packetsLost: Math.round(baseMetrics.packetsLost * (1 + profile.plr_additive * 10)),
      availableOutgoingBitrate: Math.round(baseMetrics.availableOutgoingBitrate * bitrateMultiplier),
      videoBitrateKbps: baseMetrics.videoBitrateKbps * bitrateMultiplier,
      networkBytesSent: Math.round(baseMetrics.networkBytesSent * bitrateMultiplier),
      networkBytesReceived: Math.round(baseMetrics.networkBytesReceived * bitrateMultiplier),
      framesPerSecond: clamp(baseMetrics.framesPerSecond * fpsMultiplier, 5, 30),
      frameWidth: bitrateMultiplier < 0.25 ? Math.min(baseMetrics.frameWidth, 640) : baseMetrics.frameWidth,
      frameHeight: bitrateMultiplier < 0.25 ? Math.min(baseMetrics.frameHeight, 360) : baseMetrics.frameHeight,
      freezeRatePerMin: simulatedFreezeRate,
      freezeCount: simulatedFreezeCount,
      totalFreezesDuration:
        baseMetrics.totalFreezesDuration + Math.max(simulatedFreezeRate - baseMetrics.freezeRatePerMin, 0) * 0.2,
      qualityLimitationReason: this.throttleLevel === 'MILD_4G' ? 'none' : 'bandwidth',
    };
  }
}
