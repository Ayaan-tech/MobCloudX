import type { DemoThrottleState, NetworkInfo, PlaybackMetrics } from '../types';

export interface DemoThrottleEffect {
  network: NetworkInfo;
  playback: PlaybackMetrics | null;
  meta: Record<string, unknown>;
  transient: {
    jitterMs?: number;
    packetLossPct?: number;
    avSyncOffsetMs?: number;
  };
}

export function computeDemoThrottleEffect(
  demoThrottle: DemoThrottleState | null,
  network: NetworkInfo,
  playback: PlaybackMetrics | null,
  now = Date.now()
): DemoThrottleEffect {
  if (!demoThrottle?.enabled) {
    return { network, playback, meta: {}, transient: {} };
  }

  const cycleAnchor = demoThrottle.startedAtMs ?? now;
  const elapsedMs = Math.max(0, now - cycleAnchor);
  const outageCycleMs = demoThrottle.outageCycleMs ?? 0;
  const outageDurationMs = demoThrottle.outageDurationMs ?? 0;
  const inOutageWindow =
    outageCycleMs > 0 && outageDurationMs > 0
      ? elapsedMs % outageCycleMs < outageDurationMs
      : false;

  const throughputMultiplier = inOutageWindow ? 0.35 : 1;
  const effectiveThroughputMbps = Math.max(0.15, demoThrottle.throughputMbps * throughputMultiplier);
  const targetBufferMs = Math.max(300, inOutageWindow ? demoThrottle.bufferMs * 0.45 : demoThrottle.bufferMs);
  const effectiveConnected = demoThrottle.isConnected && !inOutageWindow;
  const effectiveJitterMs = (demoThrottle.jitterMs ?? 0) + (inOutageWindow ? 35 : 0);
  const effectivePacketLossPct = Math.min(25, (demoThrottle.packetLossPct ?? 0) + (inOutageWindow ? 4.5 : 0));
  const effectiveDroppedFrames = (demoThrottle.droppedFrames ?? 0) + (inOutageWindow ? 8 : 0);
  const effectiveResolution =
    targetBufferMs <= 2500 || effectiveThroughputMbps <= 2.5
      ? '240p'
      : targetBufferMs <= 4500 || effectiveThroughputMbps <= 4.5
        ? '360p'
        : targetBufferMs <= 7000 || effectiveThroughputMbps <= 8
          ? '480p'
          : targetBufferMs <= 11000 || effectiveThroughputMbps <= 18
            ? '720p'
            : '1080p';

  const throttledNetwork: NetworkInfo = {
    ...network,
    type: demoThrottle.networkType,
    cellularGeneration: demoThrottle.cellularGeneration ?? network.cellularGeneration,
    isConnected: effectiveConnected,
    signalStrengthDbm: demoThrottle.signalStrengthDbm ?? network.signalStrengthDbm,
    isInternetReachable: effectiveConnected,
  };

  const throttledPlayback = playback
    ? {
        ...playback,
        currentBitrate: Math.round(effectiveThroughputMbps * 1000),
        bufferHealthMs: targetBufferMs,
        droppedFrames: Math.max(playback.droppedFrames ?? 0, effectiveDroppedFrames),
        currentFps: demoThrottle.profile === 'blindspot' ? (inOutageWindow ? 14 : 18) : demoThrottle.profile === 'throttled' ? 24 : 30,
        resolution: effectiveResolution,
        isBuffering:
          demoThrottle.profile === 'blindspot'
            ? playback.isBuffering || targetBufferMs < 3500 || inOutageWindow
            : demoThrottle.profile === 'throttled'
              ? playback.isBuffering || targetBufferMs < 6000
              : playback.isBuffering,
        startupLatencyMs: Math.max(playback.startupLatencyMs ?? 0, demoThrottle.startupLatencyMs ?? 0),
      }
    : {
        currentBitrate: Math.round(effectiveThroughputMbps * 1000),
        bufferHealthMs: targetBufferMs,
        droppedFrames: effectiveDroppedFrames,
        currentFps: demoThrottle.profile === 'blindspot' ? (inOutageWindow ? 14 : 18) : demoThrottle.profile === 'throttled' ? 24 : 30,
        resolution: effectiveResolution,
        playbackPosition: 0,
        duration: 0,
        isBuffering: demoThrottle.profile === 'blindspot' || inOutageWindow,
        startupLatencyMs: demoThrottle.startupLatencyMs,
      };

  return {
    network: throttledNetwork,
    playback: throttledPlayback,
    meta: {
      demo_mode: true,
      demo_throttle_profile: demoThrottle.profile,
      demo_congestion_probability: demoThrottle.congestionProbability,
      demo_outage_window: inOutageWindow,
    },
    transient: {
      jitterMs: effectiveJitterMs,
      packetLossPct: effectivePacketLossPct,
      avSyncOffsetMs: demoThrottle.profile === 'blindspot' ? 85 : demoThrottle.profile === 'throttled' ? 32 : 12,
    },
  };
}
