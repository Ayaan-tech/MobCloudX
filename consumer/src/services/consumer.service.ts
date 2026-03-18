import { type EachMessagePayload, type Consumer } from 'kafkajs'
import crypto from 'node:crypto'
import {TOPICS} from '../utils.js'
import ConsumerConfig from '../config/kafka.consumer.js'
import {writeToMongoMeasurement} from '../config/db.config.js'
import {
    TelemetryModel,
    TranscodeEventModel,
    QoeModel,
    VMAFModel,
    AdaptationDecisionModel,
    AdaptationFeedbackModel,
    ZkProofModel,
    ZkAuditModel,
} from '../types.js'
import { QoeCalculator } from './qoe.service.js'
import { getQoeCategory, startStatsLogger } from '../helpers.js'
import { Gauge, Counter, register } from 'prom-client'

const qoeCalculator = new QoeCalculator();
const kafkaConsumer: Consumer = ConsumerConfig.getConsumer();
const kafkaProducer = ConsumerConfig.getProducer();
const pendingQoeSessions = new Set<string>();

let messageStatics = {
    telemetry: 0,
    transcode: 0,
    qoe: 0,
    qoe_calculated: 0,
    vmaf: 0,
    adaptation_decisions: 0,
    adaptation_feedback: 0,
    errors: 0
}

const consumerMessagesProcessedTotal = new Counter({
    name: 'kafka_consumer_messages_processed_total',
    help: 'Total Kafka messages processed by consumer topic',
    labelNames: ['topic'] as const,
    registers: [register],
})

const consumerMessageErrorsTotal = new Counter({
    name: 'kafka_consumer_message_errors_total',
    help: 'Total Kafka message processing errors by topic',
    labelNames: ['topic'] as const,
    registers: [register],
})

const consumerMessageLagSeconds = new Gauge({
    name: 'kafka_consumer_message_lag_seconds',
    help: 'Lag proxy based on event timestamp in consumed message',
    labelNames: ['topic'] as const,
    registers: [register],
})

function safeParseMessage(value: Buffer | string | null): any | null {
    if (!value) return null
    try {
        const s = typeof value === 'string' ? value : value.toString('utf8')
        return JSON.parse(s)
    } catch (e) {
        console.warn('Failed to parse message', e)
        return null
    }
}

function updateLagProxy(topic: string, messageObj: any): void {
    const eventTs =
        typeof messageObj?.ts === 'number'
            ? messageObj.ts
            : messageObj?.ts
            ? new Date(messageObj.ts).getTime()
            : NaN

    if (!Number.isFinite(eventTs)) {
        return
    }

    const lagSeconds = Math.max(0, (Date.now() - eventTs) / 1000)
    consumerMessageLagSeconds.set({ topic }, lagSeconds)
}
export function getSessionId(obj:any): string | null{
    return obj.sessionId || obj.meta?.sessionId || null
}
export async function publishQoeScore(scoreObj: any): Promise<void>{
    try {
        await kafkaProducer.send({
            topic: TOPICS.QOE,
            messages:[
                {value: JSON.stringify(scoreObj)}
            ]
        })
        console.log('Published QoE score for session', scoreObj.sessionId)
    } catch (error) {
        console.error('Failed to publish QoE score', error);
    }
}

function hashObject(obj: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex')
}

async function createProofFromQoe(obj: any): Promise<void> {
    if (!obj?.sessionId || typeof obj?.qoe !== 'number') return
    const ts = obj.ts ?? Date.now()
    const basePayload = {
        session_id: obj.sessionId,
        qoe_score: obj.qoe,
        ts,
        details: obj.details ?? {},
    }
    const proofDoc = {
        proof_id: crypto.randomUUID(),
        proof_hash: hashObject(basePayload),
        session_hash: hashObject({ session_id: obj.sessionId }),
        session_id: obj.sessionId,
        qoe_score: obj.qoe,
        ts,
        algorithm: 'sha256-commitment-demo',
        created_at: new Date().toISOString(),
    }
    await writeToMongoMeasurement(ZkProofModel, proofDoc)
    await writeToMongoMeasurement(ZkAuditModel, {
        action: 'generate',
        proof_id: proofDoc.proof_id,
        proof_hash: proofDoc.proof_hash,
        verified: true,
        ts: Date.now(),
    })
}


async function HandleTelemetryMessage(payload: EachMessagePayload){
    const obj = safeParseMessage(payload.message.value)
    console.log('///////////////////////////////////')
    console.log('Received telemetry message:', obj)
     console.log('///////////////////////////////////')
    console.log('Message payload:', payload)
     console.log('///////////////////////////////////')
    console.log(typeof obj)
  
    if(!obj || !obj.metrics || !obj.eventType){
        console.warn('Invalid telemetry message format')
        messageStatics.errors += 1;
        return
    }
    console.log('Telemetry metrics:', obj.metrics)
    console.log('Event type:', obj.eventType)
    await writeToMongoMeasurement(TelemetryModel, obj)
    const sessionId = getSessionId(obj)
    if(sessionId){
        console.log(` Telemetry added: ${obj.eventType} for session ${sessionId}`)
        const metricPayload = {
            eventType: obj.eventType,
            ...obj.metrics
        }
        qoeCalculator.addTelemetry(sessionId, metricPayload)
    }

    // Also store vmaf_score events in the dedicated vmaf_scores collection
    // and feed into QoE calculator (in case /vmaf-score endpoint was missed)
    if (obj.eventType === 'vmaf_score' && obj.metrics?.vmaf_score != null) {
        const vmafDoc = {
            sessionId: sessionId || obj.sessionId,
            vmaf_score: obj.metrics.vmaf_score,
            resolution: obj.metrics.resolution,
            width: obj.metrics.width,
            height: obj.metrics.height,
            model: obj.metrics.model,
            ts: obj.ts || Date.now(),
        }
        await writeToMongoMeasurement(VMAFModel, vmafDoc)
        console.log(`📊 VMAF extracted from telemetry: ${vmafDoc.vmaf_score}/100 for ${vmafDoc.resolution} (session: ${vmafDoc.sessionId})`)
        
        if (vmafDoc.sessionId && vmafDoc.vmaf_score >= 0) {
            qoeCalculator.addVMAFScore(vmafDoc.sessionId, vmafDoc.vmaf_score, vmafDoc.resolution || 'unknown')
        }
        messageStatics.vmaf += 1;
    }
}
async function handleTranscodeMessage(payload: EachMessagePayload){
    const obj = safeParseMessage(payload.message.value)
    if(!obj) return

    await writeToMongoMeasurement(TranscodeEventModel, obj)
    messageStatics.transcode += 1;
    const sessionId = getSessionId(obj)
    if(sessionId){
        console.log(`Transcode event: ${obj.status} for session ${sessionId}`)
        qoeCalculator.addTranscodeEvent(sessionId, obj)
        if(obj.status === 'COMPLETED' && !pendingQoeSessions.has(sessionId)){
            pendingQoeSessions.add(sessionId)
            setTimeout(async() =>{
            console.log('Calculating QoE for session', sessionId)
            const qoeScore = qoeCalculator.calculateQoe(sessionId)
            if(qoeScore){
                const category = getQoeCategory(qoeScore.qoe)
                await writeToMongoMeasurement(QoeModel, qoeScore)
                await publishQoeScore(qoeScore)
                messageStatics.qoe_calculated += 1;
            }else{
                console.warn('QoE calculation failed for session', sessionId)
            }
            pendingQoeSessions.delete(sessionId)
            } , 5000)
        }
        
    }


}

async function handleQoeMessage(payload: EachMessagePayload) {
    const obj = safeParseMessage(payload.message.value)
    if (!obj) return
    const category = getQoeCategory(obj.qoe)
    console.log(`Received QoE score for session ${obj.sessionId}: ${obj.qoe} (${category})`)
    await writeToMongoMeasurement(QoeModel, obj)
    await createProofFromQoe(obj)

    messageStatics.qoe += 1;
}

async function handleVMAFMessage(payload: EachMessagePayload) {
    const obj = safeParseMessage(payload.message.value)
    if (!obj) return
    
    console.log(`📊 VMAF score received: ${obj.vmaf_score}/100 for ${obj.resolution} (session: ${obj.sessionId})`)
    await writeToMongoMeasurement(VMAFModel, obj)
    
    // Feed VMAF into QoE calculator for perceptual quality weighting
    const sessionId = obj.sessionId
    if (sessionId && obj.vmaf_score >= 0) {
        qoeCalculator.addVMAFScore(sessionId, obj.vmaf_score, obj.resolution)
    }
    
    messageStatics.vmaf += 1;
}

async function handleAdaptationDecisionMessage(payload: EachMessagePayload) {
    const obj = safeParseMessage(payload.message.value)
    if (!obj) return
    await writeToMongoMeasurement(AdaptationDecisionModel, obj)
    messageStatics.adaptation_decisions += 1
}

async function handleAdaptationFeedbackMessage(payload: EachMessagePayload) {
    const obj = safeParseMessage(payload.message.value)
    if (!obj) return
    await writeToMongoMeasurement(AdaptationFeedbackModel, obj)
    messageStatics.adaptation_feedback += 1
}

export async function startConsumerServices(){
    console.log('Initializing Kafka connection...')
    await ConsumerConfig.connect()
    console.log('Consumer connected. Subscribing to topics:', Object.values(TOPICS));
    await kafkaConsumer.subscribe({ topic: TOPICS.TELEMETRY, fromBeginning: false })
    await kafkaConsumer.subscribe({ topic: TOPICS.TRANSCODE, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.QOE, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.VMAF, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.ADAPTATION_DECISIONS, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.ADAPTATION_FEEDBACK, fromBeginning: false });


    await kafkaConsumer.run({
        eachMessage: async(payload) =>{
            const topic = payload.topic
            try {
                if(topic === TOPICS.TELEMETRY){
                    await HandleTelemetryMessage(payload)
                }else if(topic === TOPICS.TRANSCODE){
                    await handleTranscodeMessage(payload)
                }else if(topic === TOPICS.QOE){
                    await handleQoeMessage(payload);
                }else if(topic === TOPICS.VMAF){
                    await handleVMAFMessage(payload);
                }else if(topic === TOPICS.ADAPTATION_DECISIONS){
                    await handleAdaptationDecisionMessage(payload)
                }else if(topic === TOPICS.ADAPTATION_FEEDBACK){
                    await handleAdaptationFeedbackMessage(payload)
                }else{
                    console.warn('Unknown topic message', topic)
                }

                const parsed = safeParseMessage(payload.message.value)
                if (parsed) {
                    updateLagProxy(topic, parsed)
                }
                consumerMessagesProcessedTotal.inc({ topic })
            } catch (error) {
                console.error('Error processing message', error);
                messageStatics.errors += 1;
                consumerMessageErrorsTotal.inc({ topic })
            }
        }
    });
    startStatsLogger(messageStatics);
    console.log('Consumer services fully operational.');
}