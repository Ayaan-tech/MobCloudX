import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* Added utility functions for mobCloudX */

export function formatQoEScore(score: number): string {
  return `${score.toFixed(1)}/10`
}

export function getQoEColor(score: number): string {
  if (score >= 8) return "text-green-400"
  if (score >= 6) return "text-lime-400"
  if (score >= 4) return "text-yellow-400"
  if (score >= 2) return "text-orange-400"
  return "text-red-400"
}



export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}


export interface QoEDocument {
  qoe?: number | null
  details?: {
    qoe?: number | null
    [key: string]: any
  }
  [key: string]: any
}


export interface QoEDistribution {
  '0-2': number
  '2-4': number
  '4-6': number
  '6-8': number
  '8-10': number
}


export function extractQoEValue(doc: QoEDocument): number | null {
  // Try to get QoE from the main field
  let qoe = doc.qoe

  // If not found, try details.qoe
  if ((qoe === null || qoe === undefined) && doc.details?.qoe) {
    qoe = doc.details.qoe
  }

  // Validate the value
  if (qoe === null || qoe === undefined) {
    return null
  }

  // Handle string numbers
  if (typeof qoe === 'string') {
    qoe = parseFloat(qoe)
  }

  // Check if it's a valid number
  if (isNaN(qoe) || !isFinite(qoe)) {
    return null
  }

  return qoe
}

/**
 * Categorizes QoE score into distribution ranges
 * Assumes QoE is on a 0-100 scale, converts to 0-10
 */
export function categorizeQoE(qoe: number): keyof QoEDistribution | null {
  // Handle out of range values
  if (qoe < 0 || qoe > 100) {
    console.warn(`QoE value out of range: ${qoe}`)
    return null
  }

  // Normalize to 0-10 scale
  const normalized = qoe / 10

  if (normalized >= 0 && normalized < 2) return '0-2'
  if (normalized >= 2 && normalized < 4) return '2-4'
  if (normalized >= 4 && normalized < 6) return '4-6'
  if (normalized >= 6 && normalized < 8) return '6-8'
  if (normalized >= 8 && normalized <= 10) return '8-10'

  return null
}
export function processQoEDistribution(documents: QoEDocument[]): QoEDistribution {
  const distribution: QoEDistribution = {
    '0-2': 0,
    '2-4': 0,
    '4-6': 0,
    '6-8': 0,
    '8-10': 0,
  }

  let validCount = 0
  let invalidCount = 0

  documents.forEach((doc, index) => {
    const qoeValue = extractQoEValue(doc)

    if (qoeValue === null) {
      invalidCount++
      return
    }

    const category = categorizeQoE(qoeValue)

    if (category) {
      distribution[category]++
      validCount++
    } else {
      invalidCount++
    }
  })

  console.log(`Processed ${documents.length} documents: ${validCount} valid, ${invalidCount} invalid`)

  return distribution
}

/**
 * Converts distribution object to chart-ready array
 */
export function formatDistributionForChart(distribution: QoEDistribution) {
  return Object.entries(distribution).map(([range, jobs]) => ({
    range,
    jobs,
  }))
}

/**
 * All-in-one processor for MongoDB to Chart data
 */
export function mongoToChartData(documents: QoEDocument[]) {
  const distribution = processQoEDistribution(documents)
  return formatDistributionForChart(distribution)
}

export function getStatusColor(status: string): string {
  const normalizedStatus = status.toUpperCase()
  
  switch (normalizedStatus) {
    case 'COMPLETED':
    case 'SUCCEEDED':
    case 'SUCCESS':
      return 'bg-emerald-900/50 text-emerald-400 border border-emerald-700'
    
    case 'FAILED':
    case 'ERROR':
      return 'bg-red-900/50 text-red-400 border border-red-700'
    
    case 'STARTED':
    case 'IN_PROGRESS':
    case 'RUNNING':
    case 'PROCESSING':
      return 'bg-blue-900/50 text-blue-400 border border-blue-700'
    
    case 'PENDING':
    case 'QUEUED':
      return 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
    
    case 'CANCELLED':
    case 'CANCELED':
    case 'STOPPED':
      return 'bg-gray-900/50 text-gray-400 border border-gray-700'
    
    default:
      return 'bg-indigo-900/50 text-indigo-400 border border-indigo-700'
  }
}

/**
 * Get human-readable status text
 */
export function getStatusText(status: string): string {
  const normalizedStatus = status.toUpperCase()
  
  switch (normalizedStatus) {
    case 'COMPLETED':
      return 'Completed'
    case 'SUCCEEDED':
      return 'Succeeded'
    case 'FAILED':
      return 'Failed'
    case 'STARTED':
      return 'Started'
    case 'IN_PROGRESS':
      return 'In Progress'
    case 'PENDING':
      return 'Pending'
    case 'CANCELLED':
    case 'CANCELED':
      return 'Cancelled'
    default:
      return status.charAt(0) + status.slice(1).toLowerCase()
  }
}