import { Hono } from "hono";

import {z} from 'zod'

import {zValidator} from '@hono/zod-validator'
import { title } from "process";
import { TelemetrySchema , TrancodeEventSchema ,QoeSchema } from "../types.js";
import kafkaConfig from "../config/kafka.config.js";


const postRoutes = new Hono()

postRoutes.post(
    '/telemetry-service' ,
    zValidator("json", TelemetrySchema),
    async(c)=>{
        const body =await c.req.json('json')
        try {
            const payload = typeof body === 'string' ? JSON.parse(body) : body
            const message = { value: JSON.stringify(payload) }
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
        const body = await c.req.json('json');
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
        const body = await c.req.json('json')
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

export default postRoutes