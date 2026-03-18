

import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET() {
  let client: MongoClient | null = null;
  
  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    const telemetryCollection = db.collection('telemetry_data');
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const sessions = await telemetryCollection
      .aggregate([
        {
          $match: {
            ts: { $gte: last24Hours }
          }
        },
        {
          $group: {
            _id: '$sessionId',
            firstSeen: { $min: '$ts' },
            lastSeen: { $max: '$ts' },
            eventCount: { $sum: 1 },
            eventTypes: { $addToSet: '$eventType' }
          }
        },
        {
          $sort: { lastSeen: -1 }
        },
        {
          $limit: 50
        }
      ])
      .toArray();

    const formattedSessions = sessions.map(session => ({
      sessionId: session._id,
      firstSeen: session.firstSeen,
      lastSeen: session.lastSeen,
      eventCount: session.eventCount,
      eventTypes: session.eventTypes,
      duration: new Date(session.lastSeen).getTime() - new Date(session.firstSeen).getTime()
    }));

    return NextResponse.json({
      success: true,
      sessions: formattedSessions,
      total: sessions.length,
      timestamp: now.toISOString(),
    });

  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch sessions',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}