import { Kafka, logLevel } from 'kafkajs';
import { BROKERS, CONSUMER_GROUP_ID, KAFKA_CLIENT_ID } from '../utils.js';
import dotenv from 'dotenv';
dotenv.config();
const kafka = new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: BROKERS,
    logLevel: logLevel.ERROR
});
class ConsumerConfig {
    kafkaConsumer;
    kafkaProducer;
    constructor() {
        this.kafkaConsumer = kafka.consumer({
            groupId: CONSUMER_GROUP_ID
        });
        this.kafkaProducer = kafka.producer();
    }
    getConsumer() {
        return this.kafkaConsumer;
    }
    getProducer() {
        return this.kafkaProducer;
    }
    async connect() {
        await this.kafkaConsumer.connect();
        await this.kafkaProducer.connect();
    }
    async disconnect() {
        await this.kafkaConsumer.disconnect();
        await this.kafkaProducer.disconnect();
    }
}
export default new ConsumerConfig();
