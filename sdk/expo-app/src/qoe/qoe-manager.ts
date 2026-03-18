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

    let score = 75; // baseline

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
    }

    // Network quality
    if (!network.isConnected) {
      score -= 30;
    } else if (network.type === 'cellular' && network.cellularGeneration === '3g') {
      score -= 10;
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));
    score = score / 10; // Convert to 0-10 scale

    const result: QoEScore = {
      sessionId,
      qoe: score,
      ts: Date.now(),
      category: QoEManager.getCategory(score),
      details: {
        calculation_method: 'sdk_heuristic_v1',
      },
    };

    useSDKStore.getState().updateQoE(result);
    return result;
  }

  static getCategory(score: number): QoECategory {
    if (score >= 8.5) return 'excellent';
    if (score >= 6.5) return 'good';
    if (score >= 4.0) return 'fair';
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
