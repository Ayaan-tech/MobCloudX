import dotenv from 'dotenv';
dotenv.config();
export const TOPICS = {
    TELEMETRY: process.env.TOPIC_TELEMETRY || 'telemetry.raw',
    TRANSCODE: process.env.TOPIC_TRANSCODE || 'transcode.events',
    QOE: process.env.TOPIC_QOE || 'qoe.scores',
    VMAF: process.env.TOPIC_VMAF || 'vmaf.scores'
};
export const brokersEnv = process.env.KAFKA_BROKERS || 'localhost:29092';
export const BROKERS = brokersEnv.split(',').map(s => s.trim());
export const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'mobcloudx-consumer';
export const CONSUMER_GROUP_ID = process.env.KAFKA_CONSUMER_GROUP || 'mobcloudx-consumer-group';
export const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'mobcloudx_ts';
export const TELEMETRY_COLLECTION = 'telemetry_data';
export const TRANSCODE_COLLECTION = 'transcode_events';
export const QOE_COLLECTION = 'qoe_scores';
