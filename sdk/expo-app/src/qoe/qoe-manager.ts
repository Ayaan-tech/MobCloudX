// MobCloudX SDK — QoE Manager
// Tracks QoE scores from backend inference + local heuristics
// ─────────────────────────────────────────────────────────────

import type { QoEScore, QoECategory } from '../types';
import { useSDKStore } from '../core/store';
import { logger } from '../core/logger';

type SessionQoEWindow = {
  lastWallClockTs: number;
  totalWatchMs: number;
  bufferingMs: number;
  bufferingEvents: number;
  lastBufferingState: boolean;
  startupLatencyMs: number | null;
  lastBitrateKbps: number | null;
  bitrateSwitches: number;
  lastResolution: string | null;
  resolutionSwitches: number;
};

const MAX_WINDOW_MS = 10 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseResolutionHeight(resolution?: string): number {
  if (!resolution) return 0;

  if (resolution.endsWith('p')) {
    const parsed = Number.parseInt(resolution, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const match = resolution.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return 0;

  return Number.parseInt(match[2], 10);
}

function getResolutionScore(height: number) {
  if (height >= 1080) return 1.0;
  if (height >= 720) return 0.75;
  if (height >= 480) return 0.55;
  if (height >= 360) return 0.35;
  return 0.2;
}

function getNetworkScore(network: ReturnType<typeof useSDKStore.getState>['networkInfo']) {
  if (!network.isConnected || network.type === 'none') return 0.05;
  if (network.type === 'wifi' || network.type === 'ethernet') return 1.0;
  if (network.type === 'cellular') {
    switch (network.cellularGeneration) {
      case '5g':
        return 0.95;
      case '4g':
        return 0.82;
      case '3g':
        return 0.55;
      case '2g':
        return 0.2;
      default:
        return 0.6;
    }
  }
  return 0.6;
}

function getBitrateScore(currentBitrateKbps: number, height: number) {
  const maxBitrateKbps =
    height >= 1080 ? 6000 :
    height >= 720 ? 3500 :
    height >= 480 ? 1500 :
    height >= 360 ? 400 : 150;

  if (!currentBitrateKbps || currentBitrateKbps <= 0) {
    return clamp(getResolutionScore(height), 0, 1);
  }

  return clamp(currentBitrateKbps / maxBitrateKbps, 0, 1);
}

function getSwitchInstability(window: SessionQoEWindow) {
  const playMinutes = Math.max(window.totalWatchMs / 60000, 1);
  return clamp(
    (window.resolutionSwitches + window.bitrateSwitches) / playMinutes,
    0,
    1
  );
}

function getRebufferRatio(window: SessionQoEWindow) {
  const watchMs = Math.max(window.totalWatchMs, 1);
  return clamp(window.bufferingMs / watchMs, 0, 1);
}

function getStartupDelayPenalty(startupLatencyMs?: number) {
  if (!startupLatencyMs || startupLatencyMs <= 0) return 0;
  return clamp(startupLatencyMs / 5000, 0, 1);
}

function getFrameSmoothness(currentFps: number, droppedFrames: number) {
  const fpsScore = clamp(currentFps / 30, 0, 1);
  const dropPenalty =
    droppedFrames > 50 ? 0.35 :
    droppedFrames > 20 ? 0.2 :
    droppedFrames > 5 ? 0.08 :
    0;

  return clamp(fpsScore - dropPenalty, 0, 1);
}

/**
 * Lightweight client-side QoE estimator.
 * This runs between backend inference updates to provide
 * instant feedback. Backend AI model score takes priority.
 */
export class QoEManager {
  private readonly sessionWindows = new Map<string, SessionQoEWindow>();

  /**
   * Push a backend-computed QoE score into the store.
   */
  applyBackendScore(score: QoEScore): void {
    useSDKStore.getState().updateQoE(score);
    logger.debug(`QoE updated from backend: ${score.qoe} (${score.details?.calculation_method})`);
  }

  private getOrCreateWindow(sessionId: string): SessionQoEWindow {
    const existing = this.sessionWindows.get(sessionId);
    if (existing) {
      return existing;
    }

    const created: SessionQoEWindow = {
      lastWallClockTs: Date.now(),
      totalWatchMs: 0,
      bufferingMs: 0,
      bufferingEvents: 0,
      lastBufferingState: false,
      startupLatencyMs: null,
      lastBitrateKbps: null,
      bitrateSwitches: 0,
      lastResolution: null,
      resolutionSwitches: 0,
    };
    this.sessionWindows.set(sessionId, created);
    return created;
  }

  /**
   * Exact OTT-style local QoE estimation:
   * (0.25 * bitrate_score)
   * + (0.20 * resolution_score)
   * - (0.30 * rebuffer_ratio)
   * - (0.10 * startup_delay_penalty)
   * - (0.10 * switch_instability)
   * + (0.05 * frame_smoothness)
   */
  estimateLocal(sessionId: string): QoEScore {
    const store = useSDKStore.getState();
    const playback = store.playbackMetrics;
    const network = store.networkInfo;
    const window = this.getOrCreateWindow(sessionId);
    const now = Date.now();
    const elapsedMs = clamp(now - window.lastWallClockTs, 0, 5000);
    window.lastWallClockTs = now;

    if (playback) {
      window.totalWatchMs = clamp(window.totalWatchMs + elapsedMs, 0, MAX_WINDOW_MS);

      if (playback.isBuffering) {
        window.bufferingMs = clamp(window.bufferingMs + elapsedMs, 0, MAX_WINDOW_MS);
      }

      if (playback.isBuffering && !window.lastBufferingState && window.totalWatchMs > 0) {
        window.bufferingEvents += 1;
      }
      window.lastBufferingState = playback.isBuffering;

      if (typeof playback.startupLatencyMs === 'number' && playback.startupLatencyMs > 0) {
        window.startupLatencyMs = playback.startupLatencyMs;
      }

      const bitrateKbps = playback.currentBitrate > 0 ? playback.currentBitrate / 1000 : 0;
      if (bitrateKbps > 0 && window.lastBitrateKbps && Math.abs(bitrateKbps - window.lastBitrateKbps) / window.lastBitrateKbps > 0.15) {
        window.bitrateSwitches += 1;
      }
      if (bitrateKbps > 0) {
        window.lastBitrateKbps = bitrateKbps;
      }

      if (playback.resolution && window.lastResolution && playback.resolution !== window.lastResolution) {
        window.resolutionSwitches += 1;
      }
      if (playback.resolution) {
        window.lastResolution = playback.resolution;
      }
    }

    const resolutionHeight = parseResolutionHeight(playback?.resolution);
    const bitrateScore = getBitrateScore(
      playback?.currentBitrate ? playback.currentBitrate / 1000 : 0,
      resolutionHeight
    );
    const rebufferRatio = getRebufferRatio(window);
    const startupDelayPenalty = getStartupDelayPenalty(playback?.startupLatencyMs ?? window.startupLatencyMs ?? undefined);
    const switchInstability = getSwitchInstability(window);
    const resolutionScore = getResolutionScore(resolutionHeight);
    const frameSmoothness = getFrameSmoothness(playback?.currentFps ?? 30, playback?.droppedFrames ?? 0);
    const networkScore = getNetworkScore(network);
    const connectivityPenalty = networkScore < 0.1 ? 0.2 : 0;

    const qoe01 = clamp(
      (0.25 * bitrateScore)
      + (0.20 * resolutionScore)
      - (0.30 * rebufferRatio)
      - (0.10 * startupDelayPenalty)
      - (0.10 * switchInstability)
      + (0.05 * frameSmoothness)
      - connectivityPenalty,
      0,
      1
    );

    const score = Math.round(clamp(qoe01 * 100, 0, 100) * 100) / 100;

    const result: QoEScore = {
      sessionId,
      qoe: score,
      ts: now,
      category: QoEManager.getCategory(score),
      details: {
        calculation_method: 'ott_formula_v1',
        startup_latency_score: Math.round((1 - startupDelayPenalty) * 100) / 100,
        rebuffer_score: Math.round((1 - rebufferRatio) * 100) / 100,
        bitrate_headroom_score: Math.round(bitrateScore * 100) / 100,
        switch_stability_score: Math.round((1 - switchInstability) * 100) / 100,
        resolution_score: Math.round(resolutionScore * 100) / 100,
        frame_score: Math.round(frameSmoothness * 100) / 100,
        network_score: Math.round(networkScore * 100) / 100,
        startup_latency_ms: playback?.startupLatencyMs ?? window.startupLatencyMs ?? undefined,
        rebuffer_ratio: Math.round(rebufferRatio * 1000) / 1000,
        buffering_events: window.bufferingEvents,
        bitrate_switches: window.bitrateSwitches,
        resolution_switches: window.resolutionSwitches,
      },
    };

    useSDKStore.getState().updateQoE(result);
    return result;
  }

  static getCategory(score: number): QoECategory {
    if (score >= 85) return 'excellent';
    if (score >= 65) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  static getCategoryColor(category: QoECategory): string {
    switch (category) {
      case 'excellent': return '#22c55e'; // green
      case 'good':      return '#84cc16'; // lime
      case 'fair':      return '#eab308'; // yellow
      case 'poor':      return '#ef4444'; // red
    }
  }
}

export const qoeManager = new QoEManager();
