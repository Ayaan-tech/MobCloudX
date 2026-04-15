// ─────────────────────────────────────────────────────────────
// MobCloudX SDK — Type Definitions
// ─────────────────────────────────────────────────────────────

// ── SDK Configuration ────────────────────────────────────────

export interface MobCloudXConfig {
  /** Legacy default API base URL. Used as producer URL unless overrides are set. */
  apiBaseUrl: string;
  /** Producer API base URL (e.g. http://10.0.2.2:3001) */
  producerApiBaseUrl?: string;
  /** Inference API base URL (e.g. http://10.0.2.2:8000 or http://10.0.2.2:8000/api/v1) */
  inferenceApiBaseUrl?: string;
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

export type DemoThrottleProfile = 'normal' | 'throttled' | 'blindspot' | 'recovery';

export interface DemoThrottleState {
  enabled: boolean;
  profile: DemoThrottleProfile;
  label: string;
  startedAtMs?: number;
  throughputMbps: number;
  bufferMs: number;
  congestionProbability: number;
  networkType: NetworkInfo['type'];
  cellularGeneration?: NetworkInfo['cellularGeneration'];
  isConnected: boolean;
  signalStrengthDbm?: number;
  jitterMs?: number;
  packetLossPct?: number;
  droppedFrames?: number;
  startupLatencyMs?: number;
  outageCycleMs?: number;
  outageDurationMs?: number;
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
    jitter?: number;
    audio_jitter_ms?: number;
    audio_packet_loss_pct?: number;
    av_sync_offset_ms?: number;
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
    startup_latency_score?: number;
    rebuffer_score?: number;
    bitrate_headroom_score?: number;
    switch_stability_score?: number;
    resolution_score?: number;
    frame_score?: number;
    network_score?: number;
    startup_latency_ms?: number;
    rebuffer_ratio?: number;
    buffering_events?: number;
    bitrate_switches?: number;
    resolution_switches?: number;
  };
}

export interface QoEState {
  currentScore: number;
  category: QoECategory;
  trend: 'improving' | 'stable' | 'degrading';
  history: QoEScore[];
  lastUpdated: number;
}

export interface ZKProofRecord {
  proof_id: string;
  session_id: string;
  proof_hash: string;
  proof_mode: string;
  verified: boolean;
  sla_met: boolean;
  algorithm: string;
  public_signals: string[];
  proof: Record<string, unknown>;
  anchor?: {
    status: string;
    network?: string;
    tx_hash?: string;
    explorer_url?: string;
    proof_hash?: string;
    reason?: string;
  } | null;
  created_at: string;
  ts: number;
  payload: {
    qoe_start: number;
    qoe_minimum: number;
    qoe_recovery: number;
    stall_count: number;
    session_duration: number;
    sla_threshold: number;
    max_stalls: number;
    metadata?: Record<string, unknown>;
  };
}

export interface ZKProofState {
  status: 'idle' | 'pending' | 'generating' | 'anchored' | 'error';
  latestProof: ZKProofRecord | null;
  lastUpdated: number;
}

// ── Adaptation Types ─────────────────────────────────────────

export interface AdaptationDecision {
  decision: string;                     // e.g. "reduce_bitrate"
  target_resolution?: number;           // e.g. 480
  target_bitrate?: number;
  target_codec?: string;
  congestion_probability?: number;
  recommended_action?: 'normal' | 'prefetch_low_quality' | 'switch_to_cached' | 'upgrade';
  prefetch_seconds?: number;
  urgency?: 'normal' | 'warning' | 'critical';
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
  demoThrottle: DemoThrottleState | null;

  // QoE
  qoe: QoEState;

  // Adaptation
  adaptation: AdaptationState;

  // ZK
  zkProof: ZKProofState;

  // Player
  player: PlayerState;

  // Actions
  initialize: (config: MobCloudXConfig) => void;
  setMode: (mode: SDKMode) => void;
  updateNetworkInfo: (info: NetworkInfo) => void;
  updateBatteryInfo: (info: BatteryInfo) => void;
  updatePlaybackMetrics: (metrics: PlaybackMetrics) => void;
  updateDemoThrottle: (state: DemoThrottleState | null) => void;
  updateQoE: (score: QoEScore) => void;
  updateAdaptation: (decision: AdaptationDecision) => void;
  updateZKProof: (proof: ZKProofRecord | null, status?: ZKProofState['status']) => void;
  updatePlayerState: (state: Partial<PlayerState>) => void;
  reset: () => void;
}
