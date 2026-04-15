import type { FSMState } from './FSM';

export interface WebRTCMetrics {
  frameWidth: number;
  frameHeight: number;
  framesPerSecond: number;
  bytesReceived: number;
  videoBitrateKbps: number;
  packetsLost: number;
  packetLossRate: number;
  jitter: number;
  totalFreezesDuration: number;
  freezeCount: number;
  freezeRatePerMin: number;
  qualityLimitationReason: string;
  pliCount: number;
  nackCount: number;
  audioLevel: number;
  jitterBufferDelay: number;
  concealedSamples: number;
  totalSamplesReceived: number;
  concealedSamplesRatio: number;
  concealmentEvents: number;
  echoReturnLoss: number;
  currentRoundTripTime: number;
  availableOutgoingBitrate: number;
  networkBytesSent: number;
  networkBytesReceived: number;
  perceptualQualityScore: number | null;
  receiverSrActive: boolean;
}

export interface NormalisationFeatureParams {
  mean: number;
  std: number;
  min?: number;
  max?: number;
}

export interface NormalisationParams {
  rtt_ms: NormalisationFeatureParams;
  jitter_ms: NormalisationFeatureParams;
  plr: NormalisationFeatureParams;
  available_bitrate_kbps: NormalisationFeatureParams;
  fps: NormalisationFeatureParams;
  freeze_occurred: NormalisationFeatureParams;
}

export interface QoEWeights {
  alpha: number;
  beta: number;
  gamma: number;
  delta: number;
  epsilon: number;
}

export interface QoEResult {
  score: number;
  videoScore: number;
  audioScore: number;
  rttPenalty: number;
  jitterPenalty: number;
  freezePenalty: number;
  brisqueScore: number | null;
  srActive: boolean;
  dominantIssue: 'rtt' | 'jitter' | 'packet_loss' | 'freeze' | 'audio' | 'none';
}

export interface FeedbackEvent {
  type: 'mute_toggle' | 'camera_toggle' | 'app_background' | 'rejoin';
  timestamp: number;
}

export interface SessionFeedback {
  duration_seconds: number;
  mute_toggle_count: number;
  camera_toggle_count: number;
  app_background_count: number;
  implicit_satisfaction: 'positive' | 'negative' | 'neutral';
}

export interface QoETimelinePoint {
  timestamp: number;
  qoe_score: number;
  fsm_state: string;
}

export interface WebRTCSessionSummary {
  avg_qoe: number;
  min_qoe: number;
  p10_qoe: number;
  p50_qoe?: number;
  p90_qoe?: number;
  total_freezes: number;
  total_adaptations: number;
  duration_seconds: number;
  sla_compliance?: boolean;
  dominant_issue_distribution?: Record<string, number>;
  qoe_timeline?: QoETimelinePoint[];
}

export interface WebRTCSessionSummaryResponse {
  session_id: string;
  status: string;
  qoe_summary: WebRTCSessionSummary;
}

export interface FLSessionSummaryPayload extends WebRTCSessionSummary {
  feedback: SessionFeedback;
  session_id: string;
}

export interface FSMAction {
  targetBitrateKbps: number;
  targetResolution: string;
  enableSR: boolean;
  increaseFEC: boolean;
  reduceKeyframeInterval: boolean;
  logLevel: 'info' | 'warn' | 'critical';
}

export interface FSMTransition {
  previousState: FSMState;
  currentState: FSMState;
  changed: boolean;
  reason: string;
  recommendedAction: FSMAction;
}

export interface CongestionPrediction {
  congestionProbability: number;
  predictedBitrateKbps: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  warningLevel: 'none' | 'warning' | 'critical';
  timestamp: number;
}

export interface AdaptationState {
  bitrateKbps: number;
  resolution: string;
  srActive: boolean;
}

export interface AdaptationResult {
  applied: boolean;
  decision:
    | 'bitrate_reduced'
    | 'bitrate_increased'
    | 'resolution_changed'
    | 'sr_activated'
    | 'sr_deactivated'
    | 'no_change';
  bitrateBeforeKbps: number;
  bitrateAfterKbps: number;
  resolutionBefore: string;
  resolutionAfter: string;
  trigger: 'fsm_transition' | 'congestion_warning' | 'manual';
  skippedReason?: string;
}

export interface ParticipantQoE {
  participantId: string;
  latestMetrics: WebRTCMetrics;
  qoeScore: number;
  fsmState: FSMState;
  srActive: boolean;
  qoeResult: QoEResult;
  lastTransition: FSMTransition | null;
  latestPrediction: CongestionPrediction | null;
  latestPredictedBitrateKbps: number | null;
  latestCongestionProbability: number | null;
  warningLevel: CongestionPrediction['warningLevel'];
  lastAdaptation: AdaptationResult | null;
  lastUpdated: number;
}

export const EMPTY_WEBRTC_METRICS: WebRTCMetrics = {
  frameWidth: 0,
  frameHeight: 0,
  framesPerSecond: 0,
  bytesReceived: 0,
  videoBitrateKbps: 0,
  packetsLost: 0,
  packetLossRate: 0,
  jitter: 0,
  totalFreezesDuration: 0,
  freezeCount: 0,
  freezeRatePerMin: 0,
  qualityLimitationReason: 'none',
  pliCount: 0,
  nackCount: 0,
  audioLevel: 0,
  jitterBufferDelay: 0,
  concealedSamples: 0,
  totalSamplesReceived: 0,
  concealedSamplesRatio: 0,
  concealmentEvents: 0,
  echoReturnLoss: 0,
  currentRoundTripTime: 0,
  availableOutgoingBitrate: 0,
  networkBytesSent: 0,
  networkBytesReceived: 0,
  perceptualQualityScore: null,
  receiverSrActive: false,
};

export const EMPTY_QOE_RESULT: QoEResult = {
  score: 0,
  videoScore: 0,
  audioScore: 0,
  rttPenalty: 0,
  jitterPenalty: 0,
  freezePenalty: 0,
  brisqueScore: null,
  srActive: false,
  dominantIssue: 'none',
};

export const DEFAULT_NORMALISATION_PARAMS: NormalisationParams = {
  rtt_ms: { mean: 73.2, std: 64.1, min: 0, max: 800 },
  jitter_ms: { mean: 16.4, std: 12.8 },
  plr: { mean: 0.032, std: 0.041, min: 0, max: 0.5 },
  available_bitrate_kbps: { mean: 7278.5, std: 10694.3 },
  fps: { mean: 24.7, std: 6.9, min: 0, max: 30 },
  freeze_occurred: { mean: 0.081, std: 0.273 },
};
