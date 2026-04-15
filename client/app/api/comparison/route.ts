import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.DB_NAME || 'test';

export async function GET() {
  let client: MongoClient | null = null;

  try {
    client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(DB_NAME);

    // VMAF scores per resolution
    const vmafDocs = await db.collection('vmaf_scores')
      .find({ vmaf_score: { $gte: 0 } })
      .project({ vmaf_score: 1, resolution: 1, ts: 1, model: 1, _id: 0 })
      .sort({ ts: -1 })
      .limit(200)
      .toArray();

    const vmafByRes: Record<string, number[]> = {};
    for (const d of vmafDocs) {
      const res = d.resolution || 'unknown';
      if (!vmafByRes[res]) vmafByRes[res] = [];
      if (typeof d.vmaf_score === 'number' && d.vmaf_score >= 0) vmafByRes[res].push(d.vmaf_score);
    }

    const vmafStats = Object.entries(vmafByRes).map(([res, vals]) => ({
      resolution: res,
      avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      min: Math.round(Math.min(...vals) * 10) / 10,
      max: Math.round(Math.max(...vals) * 10) / 10,
      count: vals.length,
    }));

    // QoE scores
    const qoeDocs = await db.collection('qoe_scores')
      .find({})
      .project({ qoe: 1, details: 1, _id: 0 })
      .sort({ ts: -1 })
      .limit(200)
      .toArray();

    const qoeScores = qoeDocs.map(d => d.qoe).filter((s): s is number => typeof s === 'number');
    const qoeAvgRaw = qoeScores.length > 0 ? qoeScores.reduce((a, b) => a + b, 0) / qoeScores.length : 0;
    const qoeAvg = qoeAvgRaw > 10 ? Math.round((qoeAvgRaw / 10) * 10) / 10 : Math.round(qoeAvgRaw * 10) / 10;

    // Telemetry for FL metrics
    const telemetryDocs = await db.collection('telemetry_data')
      .find({})
      .project({ eventType: 1, metrics: 1, sessionId: 1, _id: 0 })
      .sort({ ts: -1 })
      .limit(500)
      .toArray();

    // Aggregate FL metrics
    const bufferEvents = telemetryDocs.filter(d => d.eventType === 'buffer_event' || d.metrics?.isBuffering).length;
    const adaptationDecisions = telemetryDocs.filter(d => d.eventType === 'adaptation_decision' || d.eventType === 'resolution_change').length;
    const sessionIds = new Set(telemetryDocs.map(d => d.sessionId || d.metrics?.sessionId).filter(Boolean));
    const networkTypes = telemetryDocs.reduce((acc: Record<string, number>, d) => {
      const nt = d.metrics?.networkType || d.metrics?.network_type;
      if (nt) acc[nt] = (acc[nt] || 0) + 1;
      return acc;
    }, {});
    const fpsValues = telemetryDocs
      .map(d => d.metrics?.fps)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const avgFps = fpsValues.length > 0 ? Math.round((fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length) * 10) / 10 : null;

    const resolutionProfiles = vmafStats
      .filter(stat => stat.resolution && stat.resolution !== 'unknown')
      .map(stat => ({
        resolution: stat.resolution,
        width: stat.resolution === '1080p' ? 1920 : stat.resolution === '720p' ? 1280 : stat.resolution === '480p' ? 854 : 640,
        height: stat.resolution === '1080p' ? 1080 : stat.resolution === '720p' ? 720 : stat.resolution === '480p' ? 480 : 360,
        bitrate: stat.resolution === '1080p' ? '6000k' : stat.resolution === '720p' ? '3500k' : stat.resolution === '480p' ? '1500k' : '800k',
        fps: avgFps ?? 30,
        pipeline: 'Pre-sharp → ESRGAN anime 4× → CAS',
      }));

    // Merge VMAF into profiles
    const comparison = resolutionProfiles.map(p => {
      const vmaf = vmafStats.find(v => v.resolution === p.resolution);
      return {
        ...p,
        vmaf: vmaf?.avg ?? null,
        vmafLabel: vmaf?.avg != null ? getVmafLabel(vmaf.avg) : 'Unavailable',
        qoe: qoeAvg || null,
        qoeLabel: qoeAvg ? getQoeLabel(qoeAvg * 10) : 'Unavailable',
      };
    });

    return NextResponse.json({
      success: true,
      original: {
        resolution: '360p',
        width: 640,
        height: 360,
        bitrate: '325k',
        fps: 29.97,
        vmaf: null,
        vmafLabel: 'Baseline',
        qoe: null,
        qoeLabel: 'Unavailable',
        pipeline: 'None (raw upload)',
        thumbnail: '/thumbnails/original-360p.jpg',
        preview: 'https://s3.us-east-1.amazonaws.com/video-transcoding-mob.mobcloudx.xyz/videos/input.mp4',
      },
      enhanced: comparison.map(c => ({
        ...c,
        thumbnail: `/thumbnails/enhanced-${c.resolution}.jpg`,
        preview: `/thumbnails/preview-${c.resolution}.mp4`,
      })),
      federatedLearning: {
        totalSessions: sessionIds.size,
        bufferEvents,
        adaptationDecisions,
        avgFps,
        networkDistribution: networkTypes,
        totalTelemetryEvents: telemetryDocs.length,
      },
      vmafStats,
      qoeSummary: { avg: qoeAvg, total: qoeScores.length },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching comparison data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch comparison data', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  } finally {
    if (client) await client.close();
  }
}

function getVmafLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 60) return 'Fair';
  return 'Poor';
}

function getQoeLabel(score: number): string {
  if (score >= 80) return 'Smooth';
  if (score >= 60) return 'Fair';
  if (score >= 40) return 'Laggy';
  return 'Choppy';
}
