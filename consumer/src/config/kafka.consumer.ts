import {Kafka, logLevel, type Consumer, type Producer} from 'kafkajs'
import {BROKERS, CONSUMER_GROUP_ID,KAFKA_CLIENT_ID } from '../utils.js'
import dotenv from 'dotenv'
dotenv.config()

const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: BROKERS,
    logLevel:logLevel.ERROR
});

class ConsumerConfig{
    private kafkaConsumer: Consumer;
    private kafkaProducer: Producer;
    constructor(){
        this.kafkaConsumer = kafka.consumer({
            groupId: CONSUMER_GROUP_ID
        })
        this.kafkaProducer = kafka.producer();
    }
    public getConsumer():Consumer{
        return this.kafkaConsumer;
    }
    public getProducer():Producer{
        return this.kafkaProducer;
    }
    async connect(): Promise<void>{
        await this.kafkaConsumer.connect()
        await this.kafkaProducer.connect()
    }
    async disconnect(): Promise<void> {
        await this.kafkaConsumer.disconnect();
        await this.kafkaProducer.disconnect();
    }
}

export default new ConsumerConfig();