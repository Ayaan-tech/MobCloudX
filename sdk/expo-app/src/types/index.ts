// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Type Definitions
// ─────────────────────────────────────────────────────────────

// ── SDK Configuration ────────────────────────────────────────

export interface MobCloudXConfig {
  /** Producer API base URL (e.g. http://10.0.2.2:3001) */
  apiBaseUrl: string;
  /** Telemetry push interval in ms (default: 3000) */
  telemetryIntervalMs?: number;
  /** Adaptation poll interval in ms (default: 5000) */
  adaptationPollIntervalMs?: number;
  /** Frame capture interval in ms (default: 3000) */
  frameCaptureIntervalMs?: number;
  /** Enable telemetry collection (default: true) */
  enableTelemetry?: boolean;
  /** Enable AI scoring display (default: true) */
  enableAIScoring?: boolean;
  /** Enable adaptation agent (default: true) */
  enableAdaptation?: boolean;
  /** SDK display mode */
  mode?: SDKMode;
  /** Enable haptic feedback on QoE drops */
  enableHaptics?: boolean;
  /** Debug logging */
  debug?: boolean;
}

export type SDKMode = 'user' | 'qa';

// ── Telemetry Types ──────────────────────────────────────────

export interface DeviceInfo {
  model: string;
  brand: string;
  osVersion: string;
  screenWidth: number;
  screenHeight: number;
  totalMemoryMb: number;
  deviceType: 'phone' | 'tablet';
}

export interface NetworkInfo {
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown' | 'none';
  isConnected: boolean;
  cellularGeneration?: '2g' | '3g' | '4g' | '5g' | null;
  signalStrengthDbm?: number;
  isInternetReachable?: boolean;
}

export interface BatteryInfo {
  level: number;        // 0–1
  isCharging: boolean;
}

export interface PlaybackMetrics {
  currentBitrate: number;
  bufferHealthMs: number;
  droppedFrames: number;
  currentFps: number;
  resolution: string;           // e.g. "1920x1080"
  codec?: string;
  playbackPosition: number;     // seconds
  duration: number;             // seconds
  isBuffering: boolean;
  startupLatencyMs?: number;
}

export interface TelemetryPayload {
  eventType: string;
  sessionId: string;
  ts: number;
  metrics: {
    // device
    device_model?: string;
    os_version?: string;
    screen_resolution?: string;
    total_memory_mb?: number;
    // network
    network_type?: string;
    cellular_generation?: string | null;
    is_connected?: boolean;
    signal_strength_dbm?: number;
    // battery
    battery_level?: number;
    battery_charging?: boolean;
    // playback
    bitrate?: number;
    buffer_health_ms?: number;
    dropped_frames?: number;
    current_fps?: number;
    resolution?: string;
    codec?: string;
    is_buffering?: boolean;
    playback_position?: number;
    duration?: number;
    startup_latency_ms?: number;
    // frame capture
    frame_thumbnail_base64?: string;
  };
  meta?: Record<string, unknown>;
}

// ── QoE Types ────────────────────────────────────────────────

export type QoECategory = 'excellent' | 'good' | 'fair' | 'poor';

export interface QoEScore {
  sessionId: string;
  qoe: number;            // 0–100
  ts: number;
  category: QoECategory;
  details?: {
    transcoding_speed_score?: number;
    cpu_efficiency_score?: number;
    memory_efficiency_score?: number;
    output_quality_score?: number;
    stability_score?: number;
    calculation_method?: string;
  };
}

export interface QoEState {
  currentScore: number;
  category: QoECategory;
  trend: 'improving' | 'stable' | 'degrading';
  history: QoEScore[];
  lastUpdated: number;
}

// ── Adaptation Types ─────────────────────────────────────────

export interface AdaptationDecision {
  decision: string;                     // e.g. "reduce_bitrate"
  target_resolution?: number;           // e.g. 480
  target_bitrate?: number;
  target_codec?: string;
  reason: string;
  confidence: number;                   // 0–1
  ts: number;
  model_version?: string;
  inference_latency_ms?: number;
}

export interface AdaptationFeedback {
  sessionId: string;
  decisionId?: string;
  decision: string;
  applied: boolean;
  qoe_before: number;
  qoe_after: number;
  ts: number;
}

export interface AdaptationState {
  latestDecision: AdaptationDecision | null;
  history: AdaptationDecision[];
  isPolling: boolean;
  lastPollTs: number;
}

// ── Player Types ─────────────────────────────────────────────

export interface PlayerConfig {
  source: VideoSource;
  autoPlay?: boolean;
  muted?: boolean;
  repeat?: boolean;
  resizeMode?: 'contain' | 'cover' | 'stretch';
  style?: Record<string, unknown>;
}

export interface VideoSource {
  uri: string;
  type?: 'mp4' | 'hls' | 'dash';
  headers?: Record<string, string>;
}

export interface PlayerState {
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  currentBitrate: number;
  currentResolution: string;
  volume: number;
}

// ── API Response Types ───────────────────────────────────────

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface TelemetryPostResponse {
  ok: boolean;
  topic: string;
}

// ── Store Types ──────────────────────────────────────────────

export interface SDKStore {
  // Config
  config: MobCloudXConfig;
  isInitialized: boolean;
  sessionId: string;
  mode: SDKMode;

  // Telemetry
  deviceInfo: DeviceInfo | null;
  networkInfo: NetworkInfo;
  batteryInfo: BatteryInfo;
  playbackMetrics: PlaybackMetrics | null;

  // QoE
  qoe: QoEState;

  // Adaptation
  adaptation: AdaptationState;

  // Player
  player: PlayerState;

  // Actions
  initialize: (config: MobCloudXConfig) => void;
  setMode: (mode: SDKMode) => void;
  updateNetworkInfo: (info: NetworkInfo) => void;
  updateBatteryInfo: (info: BatteryInfo) => void;
  updatePlaybackMetrics: (metrics: PlaybackMetrics) => void;
  updateQoE: (score: QoEScore) => void;
  updateAdaptation: (decision: AdaptationDecision) => void;
  updatePlayerState: (state: Partial<PlayerState>) => void;
  reset: () => void;
}
