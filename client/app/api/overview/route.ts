import { NextResponse } from "next/server"
import { MongoClient } from "mongodb"

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
const DB_NAME = process.env.DB_NAME || "test"

type JobStatus = "COMPLETED" | "FAILED" | "IN_PROGRESS" | "STARTED" | "RUNNING"

function normalizeStatus(status: unknown): JobStatus | "OTHER" {
  const value = typeof status === "string" ? status.toUpperCase() : ""
  if (value === "COMPLETED") return "COMPLETED"
  if (value === "FAILED") return "FAILED"
  if (value === "IN_PROGRESS") return "IN_PROGRESS"
  if (value === "STARTED") return "STARTED"
  if (value === "RUNNING") return "RUNNING"
  return "OTHER"
}

export async function GET() {
  let client: MongoClient | null = null

  try {
    client = await MongoClient.connect(MONGODB_URI)
    const db = client.db(DB_NAME)

    const [events, qoeDocs, vmafDocs, telemetryDocs, adaptationDocs] = await Promise.all([
      db
        .collection("transcode_events")
        .find({}, { projection: { _id: 0, status: 1, duration_ms: 1, taskArn: 1, meta: 1, ts: 1 } })
        .sort({ ts: -1 })
        .limit(500)
        .toArray(),
      db
        .collection("qoe_scores")
        .find({}, { projection: { _id: 0, qoe: 1, ts: 1 } })
        .sort({ ts: -1 })
        .limit(500)
        .toArray(),
      db
        .collection("vmaf_scores")
        .find({ vmaf_score: { $gte: 0 } }, { projection: { _id: 0, vmaf_score: 1, ts: 1 } })
        .sort({ ts: -1 })
        .limit(500)
        .toArray(),
      db
        .collection("telemetry_data")
        .find({}, { projection: { _id: 0, sessionId: 1, ts: 1 } })
        .sort({ ts: -1 })
        .limit(1000)
        .toArray(),
      db
        .collection("adaptation_decisions")
        .find({}, { projection: { _id: 0, ts: 1 } })
        .sort({ ts: -1 })
        .limit(500)
        .toArray(),
    ])

    const latestByJob = new Map<string, { status: JobStatus | "OTHER"; duration_ms?: number | null }>()

    for (const event of events) {
      const jobId =
        (typeof event.taskArn === "string" && event.taskArn) ||
        (typeof event.meta?.sessionId === "string" && event.meta.sessionId) ||
        String(event.ts ?? Math.random())

      if (!latestByJob.has(jobId)) {
        latestByJob.set(jobId, {
          status: normalizeStatus(event.status),
          duration_ms: typeof event.duration_ms === "number" ? event.duration_ms : null,
        })
      }
    }

    const jobs = Array.from(latestByJob.values())
    const totalJobs = jobs.length
    const succeeded = jobs.filter((job) => job.status === "COMPLETED").length
    const failed = jobs.filter((job) => job.status === "FAILED").length
    const inProgress = jobs.filter((job) => ["IN_PROGRESS", "STARTED", "RUNNING"].includes(job.status)).length
    const successRate = totalJobs > 0 ? (succeeded / totalJobs) * 100 : 0

    const durations = jobs
      .map((job) => (typeof job.duration_ms === "number" ? job.duration_ms : null))
      .filter((value): value is number => value !== null)
    const avgDurationMs =
      durations.length > 0 ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0

    const qoeScores = qoeDocs
      .map((doc) => (typeof doc.qoe === "number" ? doc.qoe : null))
      .filter((value): value is number => value !== null)
    const avgQoeRaw = qoeScores.length > 0 ? qoeScores.reduce((sum, value) => sum + value, 0) / qoeScores.length : 0
    const avgQoe = avgQoeRaw > 10 ? avgQoeRaw / 10 : avgQoeRaw

    const vmafScores = vmafDocs
      .map((doc) => (typeof doc.vmaf_score === "number" ? doc.vmaf_score : null))
      .filter((value): value is number => value !== null)
    const avgVmaf = vmafScores.length > 0 ? vmafScores.reduce((sum, value) => sum + value, 0) / vmafScores.length : 0

    const activeCutoff = Date.now() - 10 * 60 * 1000
    const activeSessions = new Set(
      telemetryDocs
        .filter((doc) => {
          const ts = new Date(doc.ts ?? 0).getTime()
          return Number.isFinite(ts) && ts >= activeCutoff && typeof doc.sessionId === "string" && doc.sessionId
        })
        .map((doc) => doc.sessionId as string),
    )

    return NextResponse.json({
      success: true,
      totals: {
        totalJobs,
        succeeded,
        failed,
        inProgress,
        successRate: Number(successRate.toFixed(1)),
        avgDurationMs: Math.round(avgDurationMs),
        avgQoe: Number(avgQoe.toFixed(1)),
        avgVmaf: Number(avgVmaf.toFixed(1)),
        activeSessions: activeSessions.size,
        adaptationDecisions: adaptationDocs.length,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error fetching overview data:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch overview data",
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
