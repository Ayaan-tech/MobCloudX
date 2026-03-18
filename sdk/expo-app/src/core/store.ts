// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Zustand Store
// ─────────────────────────────────────────────────────────────

import { create } from 'zustand';
// NOTE: The `uuid` package crashes on React Native Hermes because
// crypto.getRandomValues() is not available. Use a RN-safe fallback.
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
import type {
  SDKStore,
  MobCloudXConfig,
  SDKMode,
  NetworkInfo,
  BatteryInfo,
  PlaybackMetrics,
  QoEScore,
  QoECategory,
  AdaptationDecision,
  PlayerState,
  QoEState,
  AdaptationState,
} from '../types';

// ── Defaults ─────────────────────────────────────────────────

const DEFAULT_NETWORK: NetworkInfo = {
  type: 'unknown',
  isConnected: false,
};

const DEFAULT_BATTERY: BatteryInfo = {
  level: 1,
  isCharging: false,
};

const DEFAULT_QOE: QoEState = {
  currentScore: 0,
  category: 'fair',
  trend: 'stable',
  history: [],
  lastUpdated: 0,
};

const DEFAULT_ADAPTATION: AdaptationState = {
  latestDecision: null,
  history: [],
  isPolling: false,
  lastPollTs: 0,
};

const DEFAULT_PLAYER: PlayerState = {
  isPlaying: false,
  isBuffering: false,
  currentTime: 0,
  duration: 0,
  currentBitrate: 0,
  currentResolution: '0x0',
  volume: 1,
};

// ── Helpers ──────────────────────────────────────────────────

function getQoECategory(score: number): QoECategory {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}

function getQoETrend(history: QoEScore[]): 'improving' | 'stable' | 'degrading' {
  if (history.length < 3) return 'stable';
  const recent = history.slice(-5);
  const first = recent[0].qoe;
  const last = recent[recent.length - 1].qoe;
  const delta = last - first;
  if (delta > 5) return 'improving';
  if (delta < -5) return 'degrading';
  return 'stable';
}

// ── Store ────────────────────────────────────────────────────

export const useSDKStore = create<SDKStore>((set, get) => ({
  // Initial state
  config: { apiBaseUrl: '' },
  isInitialized: false,
  sessionId: '',
  mode: 'user',

  deviceInfo: null,
  networkInfo: DEFAULT_NETWORK,
  batteryInfo: DEFAULT_BATTERY,
  playbackMetrics: null,

  qoe: DEFAULT_QOE,
  adaptation: DEFAULT_ADAPTATION,
  player: DEFAULT_PLAYER,

  // ── Actions ──────────────────────────────────────────────

  initialize: (config: MobCloudXConfig) => {
    set({
      config: {
        telemetryIntervalMs: 3000,
        adaptationPollIntervalMs: 5000,
        frameCaptureIntervalMs: 3000,
        enableTelemetry: true,
        enableAIScoring: true,
        enableAdaptation: true,
        mode: 'user',
        enableHaptics: true,
        debug: false,
        ...config,
      },
      isInitialized: true,
      sessionId: generateUUID(),
      mode: config.mode ?? 'user',
    });
  },

  setMode: (mode: SDKMode) => set({ mode }),

  updateNetworkInfo: (info: NetworkInfo) => set({ networkInfo: info }),

  updateBatteryInfo: (info: BatteryInfo) => set({ batteryInfo: info }),

  updatePlaybackMetrics: (metrics: PlaybackMetrics) =>
    set({ playbackMetrics: metrics }),

  updateQoE: (score: QoEScore) => {
    const { qoe } = get();
    const updatedHistory = [...qoe.history, score].slice(-100); // keep last 100
    set({
      qoe: {
        currentScore: score.qoe,
        category: getQoECategory(score.qoe),
        trend: getQoETrend(updatedHistory),
        history: updatedHistory,
        lastUpdated: Date.now(),
      },
    });
  },

  updateAdaptation: (decision: AdaptationDecision) => {
    const { adaptation } = get();
    set({
      adaptation: {
        ...adaptation,
        latestDecision: decision,
        history: [...adaptation.history, decision].slice(-50),
        lastPollTs: Date.now(),
      },
    });
  },

  updatePlayerState: (partial: Partial<PlayerState>) => {
    const { player } = get();
    set({ player: { ...player, ...partial } });
  },

  reset: () =>
    set({
      isInitialized: false,
      sessionId: '',
      deviceInfo: null,
      networkInfo: DEFAULT_NETWORK,
      batteryInfo: DEFAULT_BATTERY,
      playbackMetrics: null,
      qoe: DEFAULT_QOE,
      adaptation: DEFAULT_ADAPTATION,
      player: DEFAULT_PLAYER,
    }),
}));
