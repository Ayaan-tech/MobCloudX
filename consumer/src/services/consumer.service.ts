import { type EachMessagePayload, type Consumer } from 'kafkajs'
import {TOPICS} from '../utils.js'
import ConsumerConfig from '../config/kafka.consumer.js'
import {writeToMongoMeasurement} from '../config/db.config.js'
import {TelemetryModel, TranscodeEventModel, QoeModel} from '../types.js'
import { QoeCalculator } from './qoe.service.js'
import { getQoeCategory, startStatsLogger } from '../helpers.js'

const qoeCalculator = new QoeCalculator();
const kafkaConsumer: Consumer = ConsumerConfig.getConsumer();
const kafkaProducer = ConsumerConfig.getProducer();

let messageStatics = {
    telemetry: 0,
    transcode: 0,
    qoe: 0,
    qoe_calculated: 0,
    errors: 0
}

function safeParseMessage(value: Buffer | string | null): any | null {
    if (!value) return null
    try {
        const s = value instanceof Buffer ? value.toString('utf8') : value
        return JSON.parse(s)
    } catch (e) {
        console.warn('Failed to parse message', e)
        return null
    }
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
        if(obj.status === 'COMPLETED'){
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

    messageStatics.qoe += 1;
}

export async function startConsumerServices(){
    console.log('Initializing Kafka connection...')
    await ConsumerConfig.connect()
    console.log('Consumer connected. Subscribing to topics:', Object.values(TOPICS));
    await kafkaConsumer.subscribe({ topic: TOPICS.TELEMETRY, fromBeginning: false })
    await kafkaConsumer.subscribe({ topic: TOPICS.TRANSCODE, fromBeginning: false });
    await kafkaConsumer.subscribe({ topic: TOPICS.QOE, fromBeginning: false });


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
                }else{
                    console.warn('Unknown topic message', topic)
                }
            } catch (error) {
                console.error('Error processing message', error);
            }
        }
    });
    startStatsLogger();
}
    console.log('Consumer services fully operational.')