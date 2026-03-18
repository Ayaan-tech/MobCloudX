import mongoose from 'mongoose';
import { BaseSchema } from './config/db.config.js';
import { TELEMETRY_COLLECTION, TRANSCODE_COLLECTION, QOE_COLLECTION } from './utils.js';
export const VMAF_COLLECTION = 'vmaf_scores';
export const TelemetryModel = mongoose.model(TELEMETRY_COLLECTION, BaseSchema, TELEMETRY_COLLECTION);
export const TranscodeEventModel = mongoose.model(TRANSCODE_COLLECTION, BaseSchema, TRANSCODE_COLLECTION);
export const QoeModel = mongoose.model(QOE_COLLECTION, BaseSchema, QOE_COLLECTION);
export const VMAFModel = mongoose.model(VMAF_COLLECTION, BaseSchema, VMAF_COLLECTION);
