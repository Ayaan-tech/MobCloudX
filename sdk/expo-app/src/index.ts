// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Public API Barrel Export
// ─────────────────────────────────────────────────────────────

// Core
export { MobCloudXSDK, initMobCloudX, destroyMobCloudX } from './core/sdk';
export { useSDKStore } from './core/store';
export { logger } from './core/logger';
export { SDKProvider, useSDKContext, SDKMode as FoundationSDKMode } from './sdk/core/SDKContext';
export { KafkaPublisher } from './sdk/core/KafkaPublisher';
export { WebRTCTelemetryAgent } from './sdk/webrtc/WebRTCTelemetryAgent';
export { CongestionPredictor } from './sdk/webrtc/CongestionPredictor';
export { WebRTCAdaptationController } from './sdk/webrtc/WebRTCAdaptationController';
export { FLWeightsAgent } from './sdk/webrtc/FLWeightsAgent';
export { ReceiverSRAgent } from './sdk/webrtc/ReceiverSRAgent';
export { SessionFeedbackCollector } from './sdk/webrtc/SessionFeedbackCollector';
export { DemoThrottleSimulator } from './sdk/webrtc/DemoThrottleSimulator';
export { PerformanceProfiler } from './sdk/webrtc/PerformanceProfiler';
export { WebRTCQoEModel, QoEThresholds, getResolutionLabel, extractQoEFeatureVector } from './sdk/webrtc/WebRTCQoEModel';
export { WebRTCFSM, FSMState } from './sdk/webrtc/FSM';
export { EMPTY_WEBRTC_METRICS, EMPTY_QOE_RESULT } from './sdk/webrtc/types';
export type {
  AdaptationResult,
  CongestionPrediction,
  FLSessionSummaryPayload,
  FeedbackEvent,
  SessionFeedback,
  WebRTCSessionSummary,
  WebRTCSessionSummaryResponse,
  ParticipantQoE,
  WebRTCMetrics,
  QoEResult,
  QoEWeights,
  FSMAction,
  FSMTransition,
  NormalisationParams,
} from './sdk/webrtc/types';
export { useWebRTCStore, webrtcEventEmitter } from './store/webrtcStore';

// Types
export type {
  MobCloudXConfig,
  SDKMode,
  TelemetryPayload,
  PlaybackMetrics,
  NetworkInfo,
  BatteryInfo,
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
export { QoESpeedometer } from './ui/qoe-speedometer';
export { BufferBarChart } from './ui/buffer-bar-chart';
export { ThroughputSparkline } from './ui/throughput-sparkline';
export { DeviceContextChips } from './ui/device-context-chips';
export { ResolutionBadge } from './ui/resolution-badge';
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

// Screens
export { default as HomeScreen } from './screens/HomeScreen';
export { default as CallScreen } from './screens/CallScreen';
export { default as SessionReplayScreen } from './screens/SessionReplayScreen';
