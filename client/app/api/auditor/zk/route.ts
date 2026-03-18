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

    const [proofs, audits] = await Promise.all([
      db
        .collection('zk_proofs')
        .find({}, { projection: { _id: 0 } })
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray(),
      db
        .collection('zk_audit_logs')
        .find({}, { projection: { _id: 0 } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray(),
    ]);

    return NextResponse.json({
      success: true,
      proofs,
      audits,
      stats: {
        proofCount: proofs.length,
        verifyEvents: audits.filter((a: any) => a.action === 'verify').length,
        generateEvents: audits.filter((a: any) => a.action === 'generate').length,
      },
      ts: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching ZK auditor data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch ZK auditor data',
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
