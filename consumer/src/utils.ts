import dotenv from 'dotenv'
dotenv.config()
export const TOPICS = {
    TELEMETRY: process.env.TOPIC_TELEMETRY || 'telemetry.raw',
    TRANSCODE: process.env.TOPIC_TRANSCODE || 'transcode.events',
    QOE: process.env.TOPIC_QOE || 'qoe.scores',
    VMAF: process.env.TOPIC_VMAF || 'vmaf.scores',
    ADAPTATION_DECISIONS: process.env.TOPIC_ADAPTATION_DECISIONS || 'adaptation.decisions',
    ADAPTATION_FEEDBACK: process.env.TOPIC_ADAPTATION_FEEDBACK || 'adaptation.feedback',
}


export const brokersEnv = process.env.KAFKA_BROKERS || 'localhost:29092'
export const BROKERS = brokersEnv.split(',').map(s => s.trim())
export const KAFKA_CLIENT_ID = process.env.KAFKA_CLIENT_ID || 'mobcloudx-consumer'
export const CONSUMER_GROUP_ID = process.env.KAFKA_CONSUMER_GROUP || 'mobcloudx-consumer-group'

export const MONGO_URI = process.env.MONGO_URI
if (!MONGO_URI) {
    throw new Error('MONGO_URI environment variable is required but not set. Please configure it in your .env file or Docker environment.')
}

export const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'test';

export const TELEMETRY_COLLECTION = 'telemetry_data';
export const TRANSCODE_COLLECTION = 'transcode_events';
export const QOE_COLLECTION = 'qoe_scores';
export const ADAPTATION_DECISIONS_COLLECTION = 'adaptation_decisions';
export const ADAPTATION_FEEDBACK_COLLECTION = 'adaptation_feedback';
export const ZK_PROOFS_COLLECTION = 'zk_proofs';
export const ZK_AUDIT_COLLECTION = 'zk_audit_logs';