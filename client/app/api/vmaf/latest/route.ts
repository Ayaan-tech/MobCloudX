import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const resolution = searchParams.get('resolution');

  let client: MongoClient | null = null;
  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    const vmafCollection = db.collection('vmaf_scores');

    // Fetch the latest 5 scores matching criteria
    const query: any = { vmaf_score: { $gte: 0 } };
    if (resolution) query.resolution = resolution;

    const docs = await vmafCollection
      .find(query)
      .sort({ ts: -1 })
      .limit(5)
      .toArray();

    if (docs.length === 0) {
      return NextResponse.json({ success: true, score: null, model: null });
    }

    // Prioritize vmaf_v0.6.1 over estimated_heuristic
    let selectedDoc = docs.find(d => d.model === 'vmaf_v0.6.1');
    if (!selectedDoc) {
      selectedDoc = docs.find(d => d.model === 'estimated_heuristic') || docs[0];
    }

    return NextResponse.json({
      success: true,
      score: selectedDoc.vmaf_score,
      model: selectedDoc.model || 'unknown',
      ts: selectedDoc.ts
    });

  } catch (error) {
    console.error('Error fetching latest VMAF:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch latest VMAF' },
      { status: 500 }
    );
  } finally {
    if (client) await client.close();
  }
}
