// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Public API Barrel Export
// ─────────────────────────────────────────────────────────────

// Core
export { MobCloudXSDK, initMobCloudX, destroyMobCloudX } from './core/sdk';
export { useSDKStore } from './core/store';
export { logger } from './core/logger';

// Types
export type {
  MobCloudXConfig,
  SDKMode,
  TelemetryPayload,
  PlaybackMetrics,
  NetworkInfo,
  BatteryInfo,
  AudioMetrics,
  DeviceInfo,
  QoEScore,
  QoECategory,
  QoEState,
  AdaptationDecision,
  AdaptationFeedback,
  AdaptationState,
  PlayerConfig,
  VideoSource,
  PlayerState,
} from './types';

// Video Player
export { MobCloudXPlayer, type MobCloudXPlayerProps, type MobCloudXPlayerRef } from './video';

// UI Components
export { QoEOverlay } from './ui/qoe-overlay';
export { QoEGauge } from './ui/qoe-gauge';
export { NetworkIndicator } from './ui/network-indicator';
export { AdaptationToast } from './ui/adaptation-toast';
export { QADebugPanel } from './ui/qa-debug-panel';

// Hooks
export {
  useQoE,
  useNetwork,
  useBattery,
  usePlayback,
  useAdaptation,
  useSDKMode,
  useSessionId,
  useQoEAlert,
  useLocalQoE,
} from './hooks';

// Services (advanced usage)
export { apiService } from './services/api.service';
export { qoeManager, QoEManager } from './qoe';
export { TelemetryManager } from './telemetry';
export { AdaptationManager } from './adaptation';
export { FederatedManager } from './federated';
export { AudioAgent, audioAgent } from './audio';
