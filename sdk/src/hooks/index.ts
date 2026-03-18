// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — React Hooks
// Clean hook API for SDK consumers
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef } from 'react';
import { useSDKStore } from '../core/store';
import { qoeManager, QoEManager } from '../qoe/qoe-manager';
import type {
  QoEState,
  NetworkInfo,
  BatteryInfo,
  PlaybackMetrics,
  AdaptationState,
  SDKMode,
  QoECategory,
} from '../types';

// ── useQoE ───────────────────────────────────────────────────

/**
 * Access current QoE state.
 * Minimal re-renders — uses Zustand selector.
 */
export function useQoE(): QoEState & { color: string } {
  const qoe = useSDKStore((s) => s.qoe);
  const color = QoEManager.getCategoryColor(qoe.category);
  return { ...qoe, color };
}

// ── useNetwork ───────────────────────────────────────────────

export function useNetwork(): NetworkInfo {
  return useSDKStore((s) => s.networkInfo);
}

// ── useBattery ───────────────────────────────────────────────

export function useBattery(): BatteryInfo {
  return useSDKStore((s) => s.batteryInfo);
}

// ── usePlayback ──────────────────────────────────────────────

export function usePlayback(): PlaybackMetrics | null {
  return useSDKStore((s) => s.playbackMetrics);
}

// ── useAdaptation ────────────────────────────────────────────

export function useAdaptation(): AdaptationState {
  return useSDKStore((s) => s.adaptation);
}

// ── useSDKMode ───────────────────────────────────────────────

export function useSDKMode(): {
  mode: SDKMode;
  setMode: (mode: SDKMode) => void;
  toggleMode: () => void;
} {
  const mode = useSDKStore((s) => s.mode);
  const setMode = useSDKStore((s) => s.setMode);
  const toggleMode = useCallback(() => {
    setMode(mode === 'user' ? 'qa' : 'user');
  }, [mode, setMode]);

  return { mode, setMode, toggleMode };
}

// ── useSessionId ─────────────────────────────────────────────

export function useSessionId(): string {
  return useSDKStore((s) => s.sessionId);
}

// ── useQoEAlert ──────────────────────────────────────────────

/**
 * Fires a callback when QoE drops below threshold.
 */
export function useQoEAlert(
  threshold: number,
  onAlert: (score: number, category: QoECategory) => void
) {
  const qoe = useSDKStore((s) => s.qoe);
  const firedRef = useRef(false);

  useEffect(() => {
    if (qoe.currentScore < threshold && !firedRef.current) {
      firedRef.current = true;
      onAlert(qoe.currentScore, qoe.category);
    } else if (qoe.currentScore >= threshold) {
      firedRef.current = false; // reset when it recovers
    }
  }, [qoe.currentScore, threshold, onAlert]);
}

// ── useLocalQoE ──────────────────────────────────────────────

/**
 * Run local QoE estimation at a given interval.
 * Useful when backend inference is slow or unavailable.
 */
export function useLocalQoE(intervalMs = 5000) {
  const sessionId = useSDKStore((s) => s.sessionId);

  useEffect(() => {
    if (!sessionId) return;

    const id = setInterval(() => {
      qoeManager.estimateLocal(sessionId);
    }, intervalMs);

    return () => clearInterval(id);
  }, [sessionId, intervalMs]);
}
