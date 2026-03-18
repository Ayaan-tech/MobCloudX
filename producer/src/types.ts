import { z } from 'zod'

export const TelemetrySchema = z.object({
    eventType:z.string(),
    sessionId:z.string().optional(),
    ts:z.number().optional(),
    metrics:z.record(z.any()).optional(),
    meta: z.record(z.any()).optional(),
})

export const TrancodeEventSchema = z.object({
    videoKey:z.string(),
    taskArn: z.string().optional(),
    status: z.enum(['STARTED', 'RUNNING', 'COMPLETED', 'FAILED']),
    outputs: z.array(z.string()).optional(),
    duration_ms:z.optional(z.number()),
    ts: z.number().optional(),
    meta: z.record(z.any()).optional(),
}).refine(data =>{
    const refinement = ['COMPLETED', 'FAILED'].includes(data.status)
    if(refinement){
        if (typeof data.duration_ms !== 'number') return false; 
        if (data.outputs?.length === 0) return false;
    }
    return true;
},{
    message: "For status COMPLETED or FAILED, duration_ms must be a number and outputs must be a non-empty array",
    path: ["duration_ms", "outputs"]
})

export const QoeSchema = z.object({
    sessionId: z.string(),
    ts: z.number().optional(),
    qoe:z.number(),
    details: z.record(z.any()).optional(),
})

export const AdaptationDecisionSchema = z.object({
    sessionId: z.string(),
    decision: z.string(),
    target_resolution: z.number().optional(),
    target_bitrate: z.number().optional(),
    target_codec: z.string().optional(),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
    ts: z.number().optional(),
    model_version: z.string().optional(),
    inference_latency_ms: z.number().optional(),
})

export const AdaptationFeedbackSchema = z.object({
    sessionId: z.string(),
    decisionId: z.string().optional(),
    decision: z.string(),
    applied: z.boolean(),
    qoe_before: z.number(),
    qoe_after: z.number(),
    ts: z.number().optional(),
})

export const VMAFScoreSchema = z.object({
    sessionId: z.string(),
    vmaf_score: z.number(),
    resolution: z.string(),
    width: z.number().optional(),
    height: z.number().optional(),
    model: z.string().optional(),
    reference: z.string().optional(),
    distorted: z.string().optional(),
    ts: z.number().optional(),
})

export type Telemetry = z.infer<typeof TelemetrySchema>
export type TrancodeEvent = z.infer<typeof TrancodeEventSchema>
export type QoeScore = z.infer<typeof QoeSchema>
export type AdaptationDecision = z.infer<typeof AdaptationDecisionSchema>
export type AdaptationFeedback = z.infer<typeof AdaptationFeedbackSchema>
export type VMAFScore = z.infer<typeof VMAFScoreSchema>
