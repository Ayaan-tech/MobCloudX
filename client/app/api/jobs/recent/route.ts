// app/api/jobs/recent/route.ts

import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
const DB_NAME = process.env.DB_NAME || 'test'

interface TranscodeEvent {
  _id: { $oid: string }
  ts: { $date: string } | Date
  status: string
  videoKey: string
  duration_ms?: number
  outputs?: string[]
  taskArn: string
  meta?: {
    sessionId: string
    container: string
  }
}

function extractTimestamp(ts: { $date: string } | Date): Date {
  if (ts instanceof Date) {
    return ts
  }
  return new Date(ts.$date)
}

function formatTimestamp(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  
  if (minutes === 0) {
    return `${remainingSeconds}s`
  }
  return `${minutes}m ${remainingSeconds}s`
}

function calculateQoE(event: TranscodeEvent): string {
  // Simple QoE calculation
  if (event.status === 'FAILED') {
    return `${(Math.random() * 3 + 2).toFixed(1)}/10`
  }
  
  if (event.status === 'STARTED' || event.status === 'IN_PROGRESS') {
    return '-'
  }
  
  if (event.status === 'COMPLETED') {
    if (event.duration_ms) {
      // Better score for faster completions (under 3 minutes is excellent)
      const minutes = event.duration_ms / 60000
      let score = 10
      
      if (minutes > 5) score = 8.5
      else if (minutes > 4) score = 9.0
      else if (minutes > 3) score = 9.5
      
      // Add some randomness
      score += (Math.random() - 0.5) * 0.5
      return `${Math.min(10, Math.max(7, score)).toFixed(1)}/10`
    }
    return '8.5/10' // Default for completed without duration
  }
  
  return '-'
}

function extractVideoName(videoKey: string): string {
  // Extract filename from path like "videos/video5.mp4"
  const parts = videoKey.split('/')
  return parts[parts.length - 1]
}

export async function GET(request: Request) {
  let client: MongoClient | null = null
  
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const status = searchParams.get('status') // Optional filter by status

    client = await MongoClient.connect(MONGODB_URI)
    const db = client.db(DB_NAME)
    const transcodeCollection = db.collection('transcode_events')

    // Build query
    const query: any = {}
    if (status) {
      query.status = status.toUpperCase()
    }

    // Fetch recent transcode events
    const events = await transcodeCollection
      .find(query)
      .sort({ ts: -1 }) // Most recent first
      .limit(limit)
      .toArray() as unknown as TranscodeEvent[]

    // Format for display
    const jobs = events.map(event => {
      const timestamp = extractTimestamp(event.ts)
      const sessionId = event.meta?.sessionId || 'N/A'
      
      return {
        id: event._id.$oid,
        sessionId: sessionId.split('-').pop() || sessionId, // Show short ID
        fullSessionId: sessionId,
        status: event.status,
        time: formatTimestamp(timestamp),
        videoKey: extractVideoName(event.videoKey),
        duration: event.duration_ms ? formatDuration(event.duration_ms) : undefined,
        qoe: calculateQoE(event),
        outputs: event.outputs || [],
        taskArn: event.taskArn
      }
    })

    return NextResponse.json({
      success: true,
      jobs,
      total: jobs.length,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching recent jobs:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch recent jobs',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    if (client) {
      await client.close()
    }
  }
}