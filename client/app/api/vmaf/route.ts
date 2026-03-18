import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET() {
  let client: MongoClient | null = null;

  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);
    const vmafCollection = db.collection('vmaf_scores');

    // Get all VMAF scores
    const vmafDocs = await vmafCollection
      .find({ vmaf_score: { $gte: 0 } })
      .project({ vmaf_score: 1, resolution: 1, sessionId: 1, ts: 1, width: 1, height: 1, model: 1, _id: 0 })
      .sort({ ts: -1 })
      .limit(500)
      .toArray();

    // Calculate summary stats
    const scores = vmafDocs.map(d => d.vmaf_score).filter((s): s is number => typeof s === 'number' && s >= 0);
    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const min = scores.length > 0 ? Math.min(...scores) : 0;
    const max = scores.length > 0 ? Math.max(...scores) : 0;
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Distribution buckets (0-10, 10-20, ..., 90-100)
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}-${(i + 1) * 10}`,
      count: 0,
    }));
    for (const s of scores) {
      const idx = Math.min(Math.floor(s / 10), 9);
      buckets[idx].count++;
    }

    // Per-resolution breakdown
    const resByResolution: Record<string, number[]> = {};
    for (const d of vmafDocs) {
      const res = d.resolution || 'unknown';
      if (!resByResolution[res]) resByResolution[res] = [];
      if (typeof d.vmaf_score === 'number' && d.vmaf_score >= 0) {
        resByResolution[res].push(d.vmaf_score);
      }
    }

    const resolutionStats = Object.entries(resByResolution).map(([res, vals]) => ({
      resolution: res,
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100,
      min: Math.round(Math.min(...vals) * 100) / 100,
      max: Math.round(Math.max(...vals) * 100) / 100,
      count: vals.length,
    }));

    // Quality classification
    const qualityDist = { excellent: 0, good: 0, fair: 0, poor: 0 };
    for (const s of scores) {
      if (s >= 93) qualityDist.excellent++;
      else if (s >= 80) qualityDist.good++;
      else if (s >= 60) qualityDist.fair++;
      else qualityDist.poor++;
    }

    // Recent scores for table
    const recentScores = vmafDocs.slice(0, 20).map(d => ({
      sessionId: d.sessionId,
      vmaf_score: Math.round(d.vmaf_score * 100) / 100,
      resolution: d.resolution,
      ts: d.ts instanceof Date ? d.ts.toISOString() : d.ts,
      quality: d.vmaf_score >= 93 ? 'Excellent' : d.vmaf_score >= 80 ? 'Good' : d.vmaf_score >= 60 ? 'Fair' : 'Poor',
    }));

    return NextResponse.json({
      success: true,
      summary: {
        total: scores.length,
        avg: Math.round(avg * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        median: Math.round(median * 100) / 100,
      },
      distribution: buckets,
      resolutionStats,
      qualityDistribution: qualityDist,
      recentScores,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching VMAF data:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch VMAF data',
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
