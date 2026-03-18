import { console } from 'inspector';
import { Kafka, logLevel } from 'kafkajs';
class KafkaConfig {
    kafka;
    producer;
    admin;
    brokers;
    constructor() {
        this.brokers = process.env.KAFKA_BROKERS || 'localhost:29092';
        this.kafka = new Kafka({
            clientId: 'producer',
            brokers: [this.brokers],
            logLevel: logLevel.ERROR
        });
        this.producer = this.kafka.producer();
        this.admin = this.kafka.admin();
    }
    async connect() {
        try {
            await this.producer.connect();
            await this.admin.connect();
            console.log('Kafka connected successfully');
        }
        catch (error) {
            console.error('Failed to connect to Kafka:', error);
            throw error;
        }
    }
    async createTopic(topic) {
        try {
            const existingTopics = await this.admin.listTopics();
            if (existingTopics.includes(topic)) {
                console.log(`✓ Topic already exists: ${topic}`);
                return;
            }
            await this.admin.createTopics({
                topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
                waitForLeaders: true
            });
            console.log(`topic Created`, topic);
        }
        catch (error) {
            console.error('Error creating the topic', topic);
        }
    }
    async sendtoTopic(topic, message) {
        try {
            await this.producer.send({
                topic,
                messages: [{ value: message }]
            });
            console.log("Message send to topic", topic);
        }
        catch (error) {
            console.error("Error sending message", error);
        }
    }
    async disconnect() {
        try {
            await this.producer.disconnect();
            await this.admin.disconnect();
            console.log('Kafka Disconnected');
        }
        catch (error) {
            console.error("Error disconnecting from Kafka", error);
        }
    }
}
export default new KafkaConfig();
