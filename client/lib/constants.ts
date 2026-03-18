/* Added constants for mobCloudX theme and configuration */

export const THEME_COLORS = {
  primary: "#3b82f6", // Blue
  secondary: "#a855f7", // Purple
  success: "#22c55e", // Green
  warning: "#fbbf24", // Amber
  error: "#ef4444", // Red
  info: "#06b6d4", // Cyan
}

export const DASHBOARD_SECTIONS = {
  OVERVIEW: "overview",
  JOBS: "jobs",
  ANALYTICS: "analytics",
  QUALITY: "quality",
  PIPELINE: "pipeline",
} as const

export const JOB_STATUSES = {
  SUCCEEDED: "Succeeded",
  FAILED: "Failed",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending",
} as const

export const QOE_SCORE_RANGES = [
  { min: 0, max: 2, label: "0-2", color: "text-red-500" },
  { min: 2, max: 4, label: "2-4", color: "text-orange-500" },
  { min: 4, max: 6, label: "4-6", color: "text-yellow-500" },
  { min: 6, max: 8, label: "6-8", color: "text-lime-500" },
  { min: 8, max: 10, label: "8-10", color: "text-green-500" },
]
