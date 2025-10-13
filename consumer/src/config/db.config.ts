import mongoose, { Schema, Document, Model, connect } from 'mongoose';
import dotenv from 'dotenv'
import { MONGO_URI } from '../utils.js';
import { Collection } from 'mongodb';
import { TELEMETRY_COLLECTION, TRANSCODE_COLLECTION, QOE_COLLECTION } from '../utils.js';

export const BaseSchema = new Schema({
    ts: { type: Date, default: Date.now, required: true },
    metaData: { type: Schema.Types.Mixed, default: {} },
},{
    timestamps: false,
    versionKey:false,
    strict:false
})


async function connectToMongo():Promise<void>{
    if(mongoose.connection.readyState >= 1) return;
    try {
        console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
        await mongoose.connect(MONGO_URI);
        const dbInstance = mongoose.connection.db;
        await ensureTimeSeriesCollection(dbInstance, TELEMETRY_COLLECTION, 'ts');
        await ensureTimeSeriesCollection(dbInstance, TRANSCODE_COLLECTION, 'ts');
        await ensureTimeSeriesCollection(dbInstance, QOE_COLLECTION, 'ts');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        throw error;
    }
}
async function ensureTimeSeriesCollection(db: mongoose.mongo.Db, name: string, timeField: string): Promise<void> {
    const collections = await db.listCollections({ name: name }).toArray();
    if (collections.length === 0) {
        await db.createCollection(name, {
            timeseries: {
                timeField: timeField,
                metaField: 'metaData', 
                granularity: 'seconds',
            }
        });
        console.log(`Created Time Series collection: ${name}`);
    } else {
        // Optional: Log a warning if the collection exists but is not time series, 
        // though Mongoose often handles this fine if schema: {strict: false} is used.
    }
}

export async function writeToMongoMeasurement(model: Model<any>, document: Record<string, any>): Promise<void> {
    try {
        const tsDate = document.ts ? new Date(document.ts) : new Date();
        const newDoc = new model({
            ...document,
            ts: tsDate,
        });

        await newDoc.save();
    } catch (err) {
        console.error(`Mongoose write error to ${model.collection.collectionName}:`, err);
    }
}

export async function shutdownDBClient(): Promise<void> {
    console.log('Closing Mongoose connection...');
    if (mongoose.connection.readyState === 1) {
        await mongoose.disconnect();
    }
}

export { connectToMongo as initDB };