// app/api/telemetry/route.ts

import { NextResponse } from 'next/server'
import { MongoClient } from 'mongodb'
import {
  processTelemetryData,
  processTelemetryDataByDays,
  getTelemetryStats,
  type TelemetryDocument
} from '@/lib/telemetry-processor'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://amjadquasmi_db_user:lOkiYzI0dzIS1tgw@cluster0.6yieivd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'
const DB_NAME = process.env.DB_NAME || 'test'

export async function GET(request: Request) {
  let client: MongoClient | null = null
  
  try {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode') || 'time' // 'time' or 'day'
    const days = parseInt(searchParams.get('days') || '1', 10)
    const sessionId = searchParams.get('sessionId') // Optional filter by session

    client = await MongoClient.connect(MONGODB_URI)
    const db = client.db(DB_NAME)
    const telemetryCollection = db.collection('telemetry_data')

    // Calculate time range
    const now = new Date()
    let startTime: Date
    
    if (mode === 'day') {
      // For day-based mode, go back N days
      startTime = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    } else {
      // For time-based mode, use last 24 hours
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    // Build query
    const query: any = {
      ts: { $gte: startTime }
    }
    
    if (sessionId) {
      query.sessionId = sessionId
    }

    // Fetch telemetry documents
    const documents = await telemetryCollection
      .find(query)
      .sort({ ts: 1 })
      .toArray()

    // Convert MongoDB documents to TelemetryDocument format
    const telemetryDocs: TelemetryDocument[] = documents.map(doc => ({
      ts: doc.ts,
      eventType: doc.eventType,
      sessionId: doc.sessionId,
      metrics: doc.metrics,
      meta: doc.meta
    }))

    // Process data based on mode
    let chartData
    if (mode === 'day') {
      chartData = processTelemetryDataByDays(telemetryDocs, days)
    } else {
      chartData = processTelemetryData(telemetryDocs)
    }

    // Get statistics
    const stats = getTelemetryStats(telemetryDocs)

    return NextResponse.json({
      success: true,
      mode,
      days: mode === 'day' ? days : undefined,
      data: chartData,
      stats,
      totalDocuments: telemetryDocs.length,
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString()
      },
      timestamp: now.toISOString()
    })

  } catch (error) {
    console.error('Error fetching telemetry:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch telemetry data',
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