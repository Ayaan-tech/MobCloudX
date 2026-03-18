import {} from 'kafkajs';
import { TOPICS } from '../utils.js';
import ConsumerConfig from '../config/kafka.consumer.js';
import { writeToMongoMeasurement } from '../config/db.config.js';
import { TelemetryModel, TranscodeEventModel, QoeModel, VMAFModel } from '../types.js';
import { QoeCalculator } from './qoe.service.js';
import { getQoeCategory, startStatsLogger } from '../helpers.js';
import { Gauge, Counter, register } from 'prom-client';
const qoeCalculator = new QoeCalculator();
const kafkaConsumer = ConsumerConfig.getConsumer();
const kafkaProducer = ConsumerConfig.getProducer();
let messageStatics = {
    telemetry: 0,
    transcode: 0,
    qoe: 0,
    qoe_calculated: 0,
    vmaf: 0,
    errors: 0
};
const consumerMessagesProcessedTotal = new Counter({
    name: 'kafka_consumer_messages_processed_total',
    help: 'Total Kafka messages processed by consumer topic',
    labelNames: ['topic'],
    registers: [register],
});
const consumerMessageErrorsTotal = new Counter({
    name: 'kafka_consumer_message_errors_total',
    help: 'Total Kafka message processing errors by topic',
    labelNames: ['topic'],
    registers: [register],
});
const consumerMessageLagSeconds = new Gauge({
    name: 'kafka_consumer_message_lag_seconds',
    help: 'Lag proxy based on event timestamp in consumed message',
    labelNames: ['topic'],
    registers: [register],
});
function safeParseMessage(value) {
    if (!value)
        return null;
    try {
        const s = typeof value === 'string' ? value : value.toString('utf8');
        return JSON.parse(s);
    }
    catch (e) {
        console.warn('Failed to parse message', e);
        return null;
    }
}
function updateLagProxy(topic, messageObj) {
    const eventTs = typeof messageObj?.ts === 'number'
        ? messageObj.ts
        : messageObj?.ts
            ? new Date(messageObj.ts).getTime()
            : NaN;
    if (!Number.isFinite(eventTs)) {
        return;
    }
    const lagSeconds = Math.max(0, (Date.now() - eventTs) / 1000);
    consumerMessageLagSeconds.set({ topic }, lagSeconds);
}
export function getSessionId(obj) {
    return obj.sessionId || obj.meta?.sessionId || null;
}
export async function publishQoeScore(scoreObj) {
    try {
        await kafkaProducer.send({
            topic: TOPICS.QOE,
            messages: [
                { value: JSON.stringify(scoreObj) }
            ]
        });
        console.log('Published QoE score for session', scoreObj.sessionId);
    }
    catch (error) {
        console.error('Failed to publish QoE score', error);
    }
}
async function HandleTelemetryMessage(payload) {
    const obj = safeParseMessage(payload.message.value);
    console.log('///////////////////////////////////');
    console.log('Received telemetry message:', obj);
    console.log('///////////////////////////////////');
    console.log('Message payload:', payload);
    console.log('///////////////////////////////////');
    console.log(typeof obj);
    if (!obj || !obj.metrics || !obj.eventType) {
        console.warn('Invalid telemetry message format');
        messageStatics.errors += 1;
        return;
    }
    console.log('Telemetry metrics:', obj.metrics);
    console.log('Event type:', obj.eventType);
    await writeToMongoMeasurement(TelemetryModel, obj);
    const sessionId = getSessionId(obj);
    if (sessionId) {
        console.log(` Telemetry added: ${obj.eventType} for session ${sessionId}`);
        const metricPayload = {
            eventType: obj.eventType,
            ...obj.metrics
        };
        qoeCalculator.addTelemetry(sessionId, metricPayload);
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
        };
        await writeToMongoMeasurement(VMAFModel, vmafDoc);
        console.log(`📊 VMAF extracted from telemetry: ${vmafDoc.vmaf_score}/100 for ${vmafDoc.resolution} (session: ${vmafDoc.sessionId})`);
        if (vmafDoc.sessionId && vmafDoc.vmaf_score >= 0) {
            qoeCalculator.addVMAFScore(vmafDoc.sessionId, vmafDoc.vmaf_score, vmafDoc.resolution || 'unknown');
        }
        messageStatics.vmaf += 1;
    }
}
async function handleTranscodeMessage(payload) {
    const obj = safeParseMessage(payload.message.value);
    if (!obj)
        return;
    await writeToMongoMeasurement(TranscodeEventModel, obj);
    messageStatics.transcode += 1;
    const sessionId = getSessionId(obj);
    if (sessionId) {
        console.log(`Transcode event: ${obj.status} for session ${sessionId}`);
        qoeCalculator.addTranscodeEvent(sessionId, obj);
        if (obj.status === 'COMPLETED') {
            setTimeout(async () => {
                console.log('Calculating QoE for session', sessionId);
                const qoeScore = qoeCalculator.calculateQoe(sessionId);
                if (qoeScore) {
                    const category = getQoeCategory(qoeScore.qoe);
                    await writeToMongoMeasurement(QoeModel, qoeScore);
                    await publishQoeScore(qoeScore);
                    messageStatics.qoe_calculated += 1;
                }
                else {
                    console.warn('QoE calculation failed for session', sessionId);
                }
            }, 5000);
        }
    }
}
async function handleQoeMessage(payload) {
    const obj = safeParseMessage(payload.message.value);
    if (!obj)
        return;
    const category = getQoeCategory(obj.qoe);
    console.log(`Received QoE score for session ${obj.sessionId}: ${obj.qoe} (${category})`);
    await writeToMongoMeasurement(QoeModel, obj);
    messageStatics.qoe += 1;
}
async function handleVMAFMessage(payload) {
    const obj = safeParseMessage(payload.message.value);
    if (!obj)
        return;
    console.log(`📊 VMAF score received: ${obj.vmaf_score}/100 for ${obj.resolution} (session: ${obj.sessionId})`);
    await writeToMongoMeasurement(VMAFModel, obj);
    // Feed VMAF into QoE calculator for perceptual quality weighting
    const sessionId = obj.sessionId;
    if (sessionId && obj.vmaf_score >= 0) {
        qoeCalculator.addVMAFScore(sessionId, obj.vmaf_score, obj.resolution);
    }
    messageStatics.vmaf += 1;
}
export async function startConsumerServices() {
    console.log('Initializing Kafka connection...');
    await ConsumerConfig.connect();
    console.log('Consumer connected. Subscribing to topics:', Object.values(TOPICS));
    await kafkaConsumer.subscribe({ topic: TOPICS.TELEMETRY, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.TRANSCODE, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.QOE, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.VMAF, fromBeginning: false });
    await kafkaConsumer.run({
        eachMessage: async (payload) => {
            const topic = payload.topic;
            try {
                if (topic === TOPICS.TELEMETRY) {
                    await HandleTelemetryMessage(payload);
                }
                else if (topic === TOPICS.TRANSCODE) {
                    await handleTranscodeMessage(payload);
                }
                else if (topic === TOPICS.QOE) {
                    await handleQoeMessage(payload);
                }
                else if (topic === TOPICS.VMAF) {
                    await handleVMAFMessage(payload);
                }
                else {
                    console.warn('Unknown topic message', topic);
                }
                const parsed = safeParseMessage(payload.message.value);
                if (parsed) {
                    updateLagProxy(topic, parsed);
                }
                consumerMessagesProcessedTotal.inc({ topic });
            }
            catch (error) {
                console.error('Error processing message', error);
                messageStatics.errors += 1;
                consumerMessageErrorsTotal.inc({ topic });
            }
        }
    });
    startStatsLogger();
}
console.log('Consumer services fully operational.');
