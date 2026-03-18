// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — QoE Manager
// Tracks QoE scores from backend inference + local heuristics
// ─────────────────────────────────────────────────────────────

import type { QoEScore, QoECategory, PlaybackMetrics, NetworkInfo } from '../types';
import { useSDKStore } from '../core/store';
import { logger } from '../core/logger';

/**
 * Lightweight client-side QoE estimator.
 * This runs between backend inference updates to provide
 * instant feedback. Backend AI model score takes priority.
 */
export class QoEManager {
  /**
   * Push a backend-computed QoE score into the store.
   */
  applyBackendScore(score: QoEScore): void {
    useSDKStore.getState().updateQoE(score);
    logger.debug(`QoE updated from backend: ${score.qoe} (${score.details?.calculation_method})`);
  }

  /**
   * Lightweight local QoE estimation based on playback + network.
   * Used for instant UI feedback between backend polling cycles.
   *
   * Scoring weights:
   *   Buffer health:    30%
   *   Dropped frames:   25%
   *   Network:          20%
   *   Bitrate headroom: 15%
   *   Startup latency:  10%
   */
  estimateLocal(sessionId: string): QoEScore {
    const store = useSDKStore.getState();
    const playback = store.playbackMetrics;
    const network = store.networkInfo;
    const audio = store.audioMetrics;
    const playerState = store.playerState;

    let score = 75; // baseline

    // ── Resolution boost / penalty ──────────────────────────
    const currentRes = playerState?.currentResolution ?? 'auto';
    if (currentRes === '1080p' || currentRes === '1920x1080') {
      score += 10; // high quality boost
    } else if (currentRes === '720p' || currentRes === '1280x720') {
      score += 2;  // neutral-good
    } else if (currentRes === '480p' || currentRes === '854x480') {
      score -= 12; // lower resolution penalty
    }

    if (playback) {
      // Buffer health (higher = better, 10s+ is excellent)
      const bufferScore = Math.min(100, (playback.bufferHealthMs / 10000) * 100);
      score = score * 0.7 + bufferScore * 0.3;

      // Dropped frames penalty
      if (playback.droppedFrames > 50) score -= 15;
      else if (playback.droppedFrames > 20) score -= 8;
      else if (playback.droppedFrames > 5) score -= 3;

      // Buffering penalty
      if (playback.isBuffering) score -= 20;

      // FPS penalty
      if (playback.currentFps < 15) score -= 15;
      else if (playback.currentFps < 24) score -= 5;

      // ── Network throughput vs resolution mismatch ─────────
      // If user is on low bandwidth but playing high res → QoE penalty
      const bitrateKbps = playback.currentBitrate ?? 0;
      if (bitrateKbps > 0) {
        const bitrateMbps = bitrateKbps / 1000;
        if (currentRes === '1080p' && bitrateMbps < 3) score -= 10;
        else if (currentRes === '720p' && bitrateMbps < 1.5) score -= 6;
      }
    }

    // Network quality
    if (!network.isConnected) {
      score -= 30;
    } else if (network.type === 'cellular' && network.cellularGeneration === '3g') {
      score -= 10;
    }

    // Audio quality contribution (jitter / packet loss / AV sync)
    if ((audio.packetLossPct ?? 0) > 3) score -= 10;
    else if ((audio.packetLossPct ?? 0) > 1) score -= 5;

    if ((audio.jitterMs ?? 0) > 80) score -= 8;
    else if ((audio.jitterMs ?? 0) > 40) score -= 4;

    if (Math.abs(audio.avSyncOffsetMs ?? 0) > 120) score -= 6;

    // Clamp
    score = Math.max(0, Math.min(100, Math.round(score)));

    const result: QoEScore = {
      sessionId,
      qoe: score,
      ts: Date.now(),
      category: QoEManager.getCategory(score),
      details: {
        calculation_method: 'sdk_heuristic_v2',
        resolution: currentRes,
      },
    };

    useSDKStore.getState().updateQoE(result);
    return result;
  }

  static getCategory(score: number): QoECategory {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 50) return 'fair';
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
