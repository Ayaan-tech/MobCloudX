// lib/telemetry-processor.ts

export interface TelemetryDocument {
  ts: Date | { $date: string }
  eventType: string
  sessionId: string
  metrics?: {
    cpu_percent?: number
    mem_mb?: number
    progress_percent?: number
    [key: string]: any
  }
  meta?: any
}

export interface TelemetryChartData {
  time: string
  messages: number
  cpu: number
}

/**
 * Safely extract timestamp from MongoDB document
 */
export function extractTimestamp(doc: TelemetryDocument): Date | null {
  try {
    if (doc.ts instanceof Date) {
      return doc.ts
    }
    if (typeof doc.ts === 'object' && '$date' in doc.ts) {
      return new Date(doc.ts.$date)
    }
    return null
  } catch (error) {
    console.error('Error parsing timestamp:', error)
    return null
  }
}

/**
 * Safely extract CPU percentage from metrics
 */
export function extractCpuPercent(doc: TelemetryDocument): number | null {
  try {
    const cpu = doc.metrics?.cpu_percent
    if (cpu === null || cpu === undefined || isNaN(cpu) || !isFinite(cpu)) {
      return null
    }
    return Number(cpu)
  } catch (error) {
    return null
  }
}

/**
 * Group documents by time buckets (hourly)
 */
export function groupByTimeInterval(
  documents: TelemetryDocument[],
  intervalHours: number = 4
): Map<string, TelemetryDocument[]> {
  const groups = new Map<string, TelemetryDocument[]>()

  documents.forEach(doc => {
    const timestamp = extractTimestamp(doc)
    if (!timestamp) return

    const hours = timestamp.getHours()
    const roundedHour = Math.floor(hours / intervalHours) * intervalHours
    const timeKey = `${roundedHour.toString().padStart(2, '0')}:00`

    if (!groups.has(timeKey)) {
      groups.set(timeKey, [])
    }
    groups.get(timeKey)!.push(doc)
  })

  return groups
}

/**
 * Group documents by day
 */
export function groupByDay(
  documents: TelemetryDocument[]
): Map<string, TelemetryDocument[]> {
  const groups = new Map<string, TelemetryDocument[]>()

  documents.forEach(doc => {
    const timestamp = extractTimestamp(doc)
    if (!timestamp) return

    // Format as YYYY-MM-DD
    const dayKey = timestamp.toISOString().split('T')[0]

    if (!groups.has(dayKey)) {
      groups.set(dayKey, [])
    }
    groups.get(dayKey)!.push(doc)
  })

  return groups
}

/**
 * Calculate average CPU for a group of documents
 */
export function calculateAverageCpu(documents: TelemetryDocument[]): number {
  const cpuValues = documents
    .map(doc => extractCpuPercent(doc))
    .filter((cpu): cpu is number => cpu !== null)

  if (cpuValues.length === 0) return 0

  const sum = cpuValues.reduce((acc, val) => acc + val, 0)
  return Math.round((sum / cpuValues.length) * 100) / 100
}

/**
 * Process telemetry data for last 24 hours (time-based)
 */
export function processTelemetryData(documents: TelemetryDocument[]): TelemetryChartData[] {
  const now = new Date()
  const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const recentDocs = documents.filter(doc => {
    const timestamp = extractTimestamp(doc)
    return timestamp && timestamp >= last24Hours
  })

  const grouped = groupByTimeInterval(recentDocs, 4)

  const timeSlots = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00']

  const chartData: TelemetryChartData[] = timeSlots.map(time => {
    const docs = grouped.get(time) || []
    
    return {
      time,
      messages: docs.length,
      cpu: calculateAverageCpu(docs),
    }
  })

  return chartData
}

/**
 * Process telemetry data by day intervals
 */
export function processTelemetryDataByDays(
  documents: TelemetryDocument[],
  daysBack: number = 1
): TelemetryChartData[] {
  const now = new Date()
  const startTime = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)

  // Filter documents within the time range
  const recentDocs = documents.filter(doc => {
    const timestamp = extractTimestamp(doc)
    return timestamp && timestamp >= startTime
  })

  // Group by day
  const grouped = groupByDay(recentDocs)

  // Generate all days in the range
  const days: string[] = []
  for (let i = daysBack; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    days.push(date.toISOString().split('T')[0])
  }

  const chartData: TelemetryChartData[] = days.map(dayKey => {
    const docs = grouped.get(dayKey) || []
    const date = new Date(dayKey)
    
    return {
      time: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      messages: docs.length,
      cpu: calculateAverageCpu(docs),
    }
  })

  return chartData
}

/**
 * Process telemetry data with custom time range
 */
export function processTelemetryDataRange(
  documents: TelemetryDocument[],
  hoursBack: number = 24,
  intervalHours: number = 4
): TelemetryChartData[] {
  const now = new Date()
  const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000)

  const recentDocs = documents.filter(doc => {
    const timestamp = extractTimestamp(doc)
    return timestamp && timestamp >= startTime
  })

  const grouped = groupByTimeInterval(recentDocs, intervalHours)

  const slots = Math.ceil(hoursBack / intervalHours)
  const timeSlots: string[] = []
  
  for (let i = 0; i <= slots; i++) {
    const hour = (i * intervalHours) % 24
    timeSlots.push(`${hour.toString().padStart(2, '0')}:00`)
  }

  const chartData: TelemetryChartData[] = timeSlots.map(time => {
    const docs = grouped.get(time) || []
    
    return {
      time,
      messages: docs.length,
      cpu: calculateAverageCpu(docs),
    }
  })

  return chartData
}

/**
 * Get telemetry statistics
 */
export function getTelemetryStats(documents: TelemetryDocument[]) {
  const eventTypes = new Map<string, number>()
  let totalCpu = 0
  let cpuCount = 0

  documents.forEach(doc => {
    const type = doc.eventType || 'unknown'
    eventTypes.set(type, (eventTypes.get(type) || 0) + 1)

    const cpu = extractCpuPercent(doc)
    if (cpu !== null) {
      totalCpu += cpu
      cpuCount++
    }
  })

  return {
    totalEvents: documents.length,
    eventTypes: Object.fromEntries(eventTypes),
    avgCpu: cpuCount > 0 ? Math.round((totalCpu / cpuCount) * 100) / 100 : 0,
  }
}