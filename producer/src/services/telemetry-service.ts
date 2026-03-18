import { Hono } from "hono";

import {z} from 'zod'

import {zValidator} from '@hono/zod-validator'
import { TelemetrySchema, TrancodeEventSchema, QoeSchema, AdaptationDecisionSchema, AdaptationFeedbackSchema, VMAFScoreSchema } from "../types.js";
import kafkaConfig from "../config/kafka.config.js";

const INFERENCE_URL = process.env.INFERENCE_URL || 'http://inference:8000'

// In-memory store for latest adaptation decisions per session
// In production, this would be backed by Redis or MongoDB
const latestDecisions = new Map<string, {
    decision: string;
    target_resolution?: number;
    target_bitrate?: number;
    target_codec?: string;
    reason: string;
    confidence: number;
    ts: number;
    model_version?: string;
    inference_latency_ms?: number;
}>();

const postRoutes = new Hono()

postRoutes.post(
    '/telemetry-service' ,
    zValidator("json", TelemetrySchema),
    async(c)=>{
        const body = await c.req.json()
        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            await kafkaConfig.sendtoTopic('telemetry.raw' , JSON.stringify(payload))
            return c.json({ok: true, topic:'telemetry.raw'})
        } catch (error) {
            console.error('Transcode publish error:', error)
            return c.json({ ok: false, error: 'failed to publish transcode event' }, 500)
        }
    } )
postRoutes.post(
    '/transcode-event',
    zValidator("json",TrancodeEventSchema ),
    async(c)=>{
        const body = await c.req.json();
        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            await kafkaConfig.sendtoTopic('transcode.events',JSON.stringify(payload))
            return c.json({ok: true, topic:'transcode.events'})
        } catch (error) {
            console.error('Transcode publish error:', error)
            return c.json({ ok: false, error: 'failed to publish transcode event' }, 500)
        }
    }
)

postRoutes.post(
    '/qoe-score',
    zValidator("json",QoeSchema ),
    async(c)=>{
        const body = await c.req.json()
        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            await kafkaConfig.sendtoTopic('qoe.scores', JSON.stringify(payload))
            return c.json({
                ok:true,
                topic:'qoe.scores'
            })
        } catch (error) {
            console.error('QoE publish error:', error)
            return c.json({ ok: false, error: 'failed to publish qoe score' }, 500)
        }
    }
)

// ── Adaptation Decision Endpoints ─────────────────────────────

/**
 * GET /adaptation/decision/:sessionId
 * SDK polls this endpoint every ~5s to fetch the latest adaptation decision.
 * Returns the most recent decision from the in-memory store.
 */
postRoutes.get(
    '/adaptation/decision/:sessionId',
    async (c) => {
        const sessionId = c.req.param('sessionId')
        const decision = latestDecisions.get(sessionId)

        if (!decision) {
            // Auto-compute from inference if no in-memory decision exists.
            try {
                const resp = await fetch(`${INFERENCE_URL}/adaptation/decision/compute/${sessionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                })

                if (resp.ok) {
                    const body = await resp.json() as { decision?: any }
                    if (body?.decision) {
                        latestDecisions.set(sessionId, body.decision)
                        return c.json(body.decision)
                    }
                }
            } catch (error) {
                console.warn('Inference decision compute failed:', error)
            }

            return c.json({ ok: false, error: 'no decision available' }, 404)
        }

        return c.json(decision)
    }
)

/**
 * POST /adaptation/decision/:sessionId
 * Inference service / adaptation agent pushes a new decision here.
 * The decision is stored in-memory and published to Kafka.
 */
postRoutes.post(
    '/adaptation/decision/:sessionId',
    zValidator('json', AdaptationDecisionSchema),
    async (c) => {
        const sessionId = c.req.param('sessionId')
        const body = await c.req.json()

        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            const decision = {
                ...payload,
                sessionId,
                ts: payload.ts ?? Date.now(),
            }

            // Store latest decision for GET polling
            latestDecisions.set(sessionId, decision)

            // Publish to Kafka for downstream consumers (logging, analytics)
            await kafkaConfig.sendtoTopic('adaptation.decisions', JSON.stringify(decision))

            return c.json({ ok: true, topic: 'adaptation.decisions', sessionId })
        } catch (error) {
            console.error('Adaptation decision publish error:', error)
            return c.json({ ok: false, error: 'failed to publish adaptation decision' }, 500)
        }
    }
)

/**
 * POST /adaptation/feedback
 * SDK sends feedback about how an applied decision affected QoE.
 * Published to Kafka for the RL feedback loop.
 */
postRoutes.post(
    '/adaptation/feedback',
    zValidator('json', AdaptationFeedbackSchema),
    async (c) => {
        const body = await c.req.json()

        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            const feedback = {
                ...payload,
                ts: payload.ts ?? Date.now(),
            }

            await kafkaConfig.sendtoTopic('adaptation.feedback', JSON.stringify(feedback))

            return c.json({ ok: true, topic: 'adaptation.feedback' })
        } catch (error) {
            console.error('Adaptation feedback publish error:', error)
            return c.json({ ok: false, error: 'failed to publish adaptation feedback' }, 500)
        }
    }
)

// ── VMAF Score Endpoint ───────────────────────────────────────

/**
 * POST /vmaf-score
 * Transcode container posts VMAF perceptual quality scores after transcoding.
 * Published to Kafka topic 'vmaf.scores' for downstream consumption.
 */
postRoutes.post(
    '/vmaf-score',
    zValidator('json', VMAFScoreSchema),
    async (c) => {
        const body = await c.req.json()
        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            const vmafData = {
                ...payload,
                ts: payload.ts ?? Date.now(),
            }
            await kafkaConfig.sendtoTopic('vmaf.scores', JSON.stringify(vmafData))
            return c.json({ ok: true, topic: 'vmaf.scores' })
        } catch (error) {
            console.error('VMAF score publish error:', error)
            return c.json({ ok: false, error: 'failed to publish vmaf score' }, 500)
        }
    }
)

export default postRoutes