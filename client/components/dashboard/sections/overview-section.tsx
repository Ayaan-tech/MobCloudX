"use client"

import { useEffect, useState } from "react"
import { TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import RecentJobsTable from "../components/recent-jobs-table"

interface OverviewResponse {
  success: boolean
  totals: {
    totalJobs: number
    succeeded: number
    failed: number
    inProgress: number
    successRate: number
    avgDurationMs: number
    avgQoe: number
    avgVmaf: number
    activeSessions: number
    adaptationDecisions: number
  }
}

export default function OverviewSection() {
  const [data, setData] = useState<OverviewResponse["totals"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const response = await fetch("/api/overview", { cache: "no-store" })
        const result: OverviewResponse = await response.json()
        if (!mounted) return
        if (!result.success) {
          throw new Error("Failed to fetch overview metrics")
        }
        setData(result.totals)
        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "Failed to load overview data")
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const formatDuration = (durationMs: number) => {
    if (!durationMs) return "No completed jobs yet"
    const minutes = durationMs / 60000
    return `${minutes.toFixed(1)} min avg processing`
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewKPI
          title="Total Jobs"
          value={loading ? "..." : data?.totalJobs?.toLocaleString() ?? "0"}
          change={error ? error : formatDuration(data?.avgDurationMs ?? 0)}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          positive
        />
        <OverviewKPI
          title="Succeeded"
          value={loading ? "..." : data?.succeeded?.toLocaleString() ?? "0"}
          change={`${data?.successRate?.toFixed?.(1) ?? "0.0"}% success rate`}
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          positive
        />
        <OverviewKPI
          title="Failed"
          value={loading ? "..." : data?.failed?.toLocaleString() ?? "0"}
          change={`${data?.avgQoe?.toFixed?.(1) ?? "0.0"}/10 avg QoE across scored sessions`}
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          positive={false}
        />
        <OverviewKPI
          title="In Progress"
          value={loading ? "..." : data?.inProgress?.toLocaleString() ?? "0"}
          change={`${data?.activeSessions?.toString() ?? "0"} active SDK sessions • ${data?.avgVmaf?.toFixed?.(1) ?? "0.0"} avg VMAF`}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          positive
        />
      </div>

      <RecentJobsTable />
    </div>
  )
}

function OverviewKPI({
  title,
  value,
  change,
  icon,
  positive,
}: {
  title: string
  value: string
  change: string
  icon: React.ReactNode
  positive: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs mt-1 ${positive ? "text-muted-foreground" : "text-red-500"}`}>
          {change}
        </p>
      </CardContent>
    </Card>
  )
}
