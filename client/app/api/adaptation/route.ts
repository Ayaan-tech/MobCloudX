import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '100'), 500);

  let client: MongoClient | null = null;

  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);

    const [decisions, feedback] = await Promise.all([
      db
        .collection('adaptation_decisions')
        .find({}, { projection: { _id: 0 } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray(),
      db
        .collection('adaptation_feedback')
        .find({}, { projection: { _id: 0 } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray(),
    ]);

    return NextResponse.json({
      success: true,
      decisions,
      feedback,
      counts: {
        decisions: decisions.length,
        feedback: feedback.length,
      },
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching adaptation data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch adaptation data',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      await client.close();
    }
  }
}
