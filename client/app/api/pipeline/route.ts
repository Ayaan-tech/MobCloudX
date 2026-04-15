import { NextResponse } from "next/server"
import { MongoClient } from "mongodb"

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
const DB_NAME = process.env.DB_NAME || "test"

function getJobId(event: any): string {
  return (
    (typeof event.taskArn === "string" && event.taskArn) ||
    (typeof event.meta?.sessionId === "string" && event.meta.sessionId) ||
    String(event._id ?? event.ts ?? Math.random())
  )
}

export async function GET() {
  let client: MongoClient | null = null

  try {
    client = await MongoClient.connect(MONGODB_URI)
    const db = client.db(DB_NAME)

    const [events, qoeCount, vmafCount, telemetryCount, adaptationCount] = await Promise.all([
      db
        .collection("transcode_events")
        .find({}, { projection: { _id: 0, status: 1, taskArn: 1, meta: 1, duration_ms: 1, outputs: 1, ts: 1 } })
        .sort({ ts: -1 })
        .limit(1000)
        .toArray(),
      db.collection("qoe_scores").countDocuments({}),
      db.collection("vmaf_scores").countDocuments({ vmaf_score: { $gte: 0 } }),
      db.collection("telemetry_data").countDocuments({}),
      db.collection("adaptation_decisions").countDocuments({}),
    ])

    const latestByJob = new Map<string, any>()
    let totalOutputCount = 0
    let totalDurationMs = 0
    let durationSamples = 0

    for (const event of events) {
      const jobId = getJobId(event)
      if (!latestByJob.has(jobId)) {
        latestByJob.set(jobId, event)
      }
      if (Array.isArray(event.outputs)) {
        totalOutputCount += event.outputs.length
      }
      if (typeof event.duration_ms === "number") {
        totalDurationMs += event.duration_ms
        durationSamples += 1
      }
    }

    const latestJobs = Array.from(latestByJob.values())
    const totalJobs = latestJobs.length
    const completed = latestJobs.filter((job) => String(job.status).toUpperCase() === "COMPLETED").length
    const failed = latestJobs.filter((job) => String(job.status).toUpperCase() === "FAILED").length
    const active = latestJobs.filter((job) =>
      ["STARTED", "IN_PROGRESS", "RUNNING"].includes(String(job.status).toUpperCase()),
    ).length

    const validationPassed = Math.max(totalJobs - failed, 0)
    const transcodingActive = completed + active
    const delivered = completed

    const stages = [
      {
        name: "Ingestion",
        count: totalJobs,
        percent: totalJobs > 0 ? 100 : 0,
        detail: `${telemetryCount.toLocaleString()} telemetry events captured`,
      },
      {
        name: "Validation",
        count: validationPassed,
        percent: totalJobs > 0 ? Number(((validationPassed / totalJobs) * 100).toFixed(1)) : 0,
        detail: `${failed.toLocaleString()} jobs failed validation or execution`,
      },
      {
        name: "Transcoding",
        count: transcodingActive,
        percent: totalJobs > 0 ? Number(((transcodingActive / totalJobs) * 100).toFixed(1)) : 0,
        detail: `${totalOutputCount.toLocaleString()} rendition outputs produced`,
      },
      {
        name: "QoE Analysis",
        count: qoeCount,
        percent: totalJobs > 0 ? Number(((qoeCount / totalJobs) * 100).toFixed(1)) : 0,
        detail: `${adaptationCount.toLocaleString()} adaptation decisions recorded`,
      },
      {
        name: "Delivery",
        count: delivered,
        percent: totalJobs > 0 ? Number(((delivered / totalJobs) * 100).toFixed(1)) : 0,
        detail: `${vmafCount.toLocaleString()} perceptual quality checks completed`,
      },
    ]

    const links = [
      { source: "Ingestion", target: "Validation", value: totalJobs },
      { source: "Validation", target: "Transcoding", value: validationPassed },
      { source: "Validation", target: "Failed", value: failed },
      { source: "Transcoding", target: "QoE Analysis", value: Math.min(transcodingActive, qoeCount || transcodingActive) },
      { source: "QoE Analysis", target: "Delivery", value: Math.min(qoeCount, delivered) },
    ]

    const avgDurationMinutes = durationSamples > 0 ? totalDurationMs / durationSamples / 60000 : 0
    const successRate = totalJobs > 0 ? (completed / totalJobs) * 100 : 0

    return NextResponse.json({
      success: true,
      stages,
      links,
      health: {
        successRate: Number(successRate.toFixed(1)),
        activeJobs: active,
        failedJobs: failed,
        avgDurationMinutes: Number(avgDurationMinutes.toFixed(1)),
        bottleneckCount: Math.max(active, failed),
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching pipeline data:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch pipeline data",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  } finally {
    if (client) {
      await client.close()
    }
  }
}
