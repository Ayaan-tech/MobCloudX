import mongoose from 'mongoose';
import {Document} from 'mongoose'
import { BaseSchema } from './config/db.config.js';
import  {TELEMETRY_COLLECTION, TRANSCODE_COLLECTION, QOE_COLLECTION} from './utils.js'

export interface ITelemetry extends Document {
    eventType: string;
    sessionId?: string;
    ts: Date;
    metrics?: Record<string, any>;
    meta?: Record<string, any>;
}

export interface ITranscodeEvent extends Document {
    videoKey: string;
    status: 'STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
    duration_ms?: number;
    ts: Date;
    outputs?: string[];
    meta?: Record<string, any>;
}

export interface IQoeScore extends Document {
    sessionId: string;
    qoe: number;
    ts: Date;
    details?: Record<string, any>;
}

export const TelemetryModel: Model<ITelemetry> = mongoose.model<ITelemetry>(TELEMETRY_COLLECTION, BaseSchema, TELEMETRY_COLLECTION);
export const TranscodeEventModel: Model<ITranscodeEvent> = mongoose.model<ITranscodeEvent>(TRANSCODE_COLLECTION, BaseSchema, TRANSCODE_COLLECTION);
export const QoeModel: Model<IQoeScore> = mongoose.model<IQoeScore>(QOE_COLLECTION, BaseSchema, QOE_COLLECTION);

export interface TelemetryMetrics{
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
}

export interface TranscodeEvent{
    videoKey: string;
    status: string;
    duration_ms?: number;
    outputs?: any[];
    ts?: number;
}

export interface QoeScore{
    sessionId: string;
    qoe: number;
    ts:number;
    details?: Record<string, any>;
}