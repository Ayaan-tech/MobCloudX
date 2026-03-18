import mongoose from 'mongoose';
import type { Model } from 'mongoose';
import { BaseSchema } from './config/db.config.js';
import {
  TELEMETRY_COLLECTION,
  TRANSCODE_COLLECTION,
  QOE_COLLECTION,
  ADAPTATION_DECISIONS_COLLECTION,
  ADAPTATION_FEEDBACK_COLLECTION,
  ZK_PROOFS_COLLECTION,
  ZK_AUDIT_COLLECTION,
} from './utils.js';

export const VMAF_COLLECTION = 'vmaf_scores';

export interface ITelemetry {
  eventType: string;
  sessionId?: string;
  ts: Date;
  metrics?: Record<string, any>;
  meta?: Record<string, any>;
}

export interface ITranscodeEvent {
  videoKey: string;
  status: 'STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  duration_ms?: number;
  ts: Date;
  outputs?: string[];
  meta?: Record<string, any>;
}

export interface IQoeScore {
  sessionId: string;
  qoe: number;
  ts: Date;
  details?: Record<string, any>;
}

export interface IVMAFScore {
  sessionId: string;
  vmaf_score: number;
  resolution: string;
  width?: number;
  height?: number;
  model?: string;
  ts: Date;
  meta?: Record<string, any>;
}

export interface IAdaptationDecision {
  sessionId: string;
  decision: string;
  target_resolution?: number;
  target_bitrate?: number;
  target_codec?: string;
  reason: string;
  confidence: number;
  ts: Date;
  model_version?: string;
  inference_latency_ms?: number;
}

export interface IAdaptationFeedback {
  sessionId: string;
  decisionId?: string;
  decision: string;
  applied: boolean;
  qoe_before: number;
  qoe_after: number;
  ts: Date;
}

export interface IZkProof {
  proof_id: string;
  proof_hash: string;
  session_hash: string;
  session_id: string;
  qoe_score: number;
  ts: number;
  algorithm: string;
  created_at: string;
}

export interface IZkAuditLog {
  action: string;
  proof_id?: string;
  proof_hash?: string;
  verified?: boolean;
  ts: number;
}

export const TelemetryModel: Model<ITelemetry> = mongoose.model<ITelemetry>(
  TELEMETRY_COLLECTION,
  BaseSchema,
  TELEMETRY_COLLECTION
);
export const TranscodeEventModel: Model<ITranscodeEvent> = mongoose.model<ITranscodeEvent>(
  TRANSCODE_COLLECTION,
  BaseSchema,
  TRANSCODE_COLLECTION
);
export const QoeModel: Model<IQoeScore> = mongoose.model<IQoeScore>(
  QOE_COLLECTION,
  BaseSchema,
  QOE_COLLECTION
);
export const VMAFModel: Model<IVMAFScore> = mongoose.model<IVMAFScore>(
  VMAF_COLLECTION,
  BaseSchema,
  VMAF_COLLECTION
);
export const AdaptationDecisionModel: Model<IAdaptationDecision> = mongoose.model<IAdaptationDecision>(
  ADAPTATION_DECISIONS_COLLECTION,
  BaseSchema,
  ADAPTATION_DECISIONS_COLLECTION
);
export const AdaptationFeedbackModel: Model<IAdaptationFeedback> = mongoose.model<IAdaptationFeedback>(
  ADAPTATION_FEEDBACK_COLLECTION,
  BaseSchema,
  ADAPTATION_FEEDBACK_COLLECTION
);
export const ZkProofModel: Model<IZkProof> = mongoose.model<IZkProof>(
  ZK_PROOFS_COLLECTION,
  BaseSchema,
  ZK_PROOFS_COLLECTION
);
export const ZkAuditModel: Model<IZkAuditLog> = mongoose.model<IZkAuditLog>(
  ZK_AUDIT_COLLECTION,
  BaseSchema,
  ZK_AUDIT_COLLECTION
);

export interface TelemetryMetrics {
  eventType: string;
  sessionId?: string;
  ts?: number;
  cpu_percent?: number;
  mem_mb?: number;
  progress_percent?: number;
  elapsed_sec?: number;
  frames?: number;
  currentFps?: number;
  duration?: number;
  file_size_mb?: number;
  output_size_mb?: number;
  resolution?: string;
  target_width?: number;
  target_height?: number;
  audio_jitter_ms?: number;
  audio_packet_loss_pct?: number;
  audio_latency_ms?: number;
  av_sync_offset_ms?: number;
}

export interface TranscodeEvent {
  videoKey: string;
  status: string;
  duration_ms?: number;
  outputs?: any[];
  ts?: number;
}

export interface QoeScore {
  sessionId: string;
  qoe: number;
  ts: number;
  details?: Record<string, any>;
}
