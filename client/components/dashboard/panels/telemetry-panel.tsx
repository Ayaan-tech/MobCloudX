"use client"

import { useState, useEffect, useCallback } from "react"
import { Activity, Wifi, WifiOff, Cpu, HardDrive, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts"

// ── Types ────────────────────────────────────────────────────

interface TelemetryStats {
  totalDocuments: number
  avgCpu: number
  avgBitrate: number
  avgBufferHealth: number
  networkTypes: Record<string, number>
  connectedSessions: number
}

interface TelemetryChartData {
  time: string
  messages: number
  cpu: number
}

interface ApiResponse {
  success: boolean
  data: TelemetryChartData[]
  stats: TelemetryStats
  totalDocuments: number
  timeRange: { start: string; end: string }
}

// ── Chart Configs ────────────────────────────────────────────

const throughputConfig = {
  messages: { label: "Messages", color: "var(--chart-1)" },
  cpu: { label: "Avg CPU %", color: "var(--chart-2)" },
} satisfies ChartConfig

const bitrateConfig = {
  bitrate: { label: "Bitrate (kbps)", color: "var(--chart-1)" },
  buffer: { label: "Buffer Health (ms)", color: "var(--chart-4)" },
} satisfies ChartConfig

// ── Component ────────────────────────────────────────────────

export default function TelemetryPanel() {
  const [viewMode, setViewMode] = useState<"time" | "day">("time")
  const [dayInterval, setDayInterval] = useState(1)
  const [data, setData] = useState<TelemetryChartData[]>([])
  const [stats, setStats] = useState<TelemetryStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/telemetry?mode=${viewMode}&days=${dayInterval}`)
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json.data ?? [])
        setStats(json.stats ?? null)
      }
    } catch (err) {
      console.error("Telemetry fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [viewMode, dayInterval])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Events"
          value={stats?.totalDocuments?.toLocaleString() ?? "—"}
          description="Telemetry payloads received"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <KPICard
          title="Avg CPU"
          value={stats?.avgCpu != null ? `${stats.avgCpu.toFixed(1)}%` : "—"}
          description="Across all sessions"
          icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
        />
        <KPICard
          title="Avg Bitrate"
          value={stats?.avgBitrate != null ? `${Math.round(stats.avgBitrate)} kbps` : "—"}
          description="Current playback avg"
          icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
        />
        <KPICard
          title="Connected"
          value={stats?.connectedSessions?.toString() ?? "—"}
          description="Active sessions"
          icon={stats?.connectedSessions ? <Wifi className="h-4 w-4 text-muted-foreground" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-1">
          <button
            onClick={() => setViewMode("time")}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              viewMode === "time"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Time Based
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
              viewMode === "day"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Day Based
          </button>
        </div>

        {viewMode === "day" && (
          <select
            value={dayInterval}
            onChange={(e) => setDayInterval(Number(e.target.value))}
            className="h-8 rounded-md border border-border bg-background px-3 text-xs"
          >
            {[1, 2, 7, 10, 30].map((d) => (
              <option key={d} value={d}>{d} Day{d > 1 ? "s" : ""}</option>
            ))}
          </select>
        )}

        <button
          onClick={fetchData}
          disabled={loading}
          className="ml-auto h-8 px-3 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Throughput Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Message Throughput</CardTitle>
            <CardDescription>Messages consumed over time</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && data.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : (
              <ChartContainer config={throughputConfig} className="h-[250px] w-full">
                <AreaChart data={data} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="messages"
                    fill="var(--color-messages)"
                    fillOpacity={0.2}
                    stroke="var(--color-messages)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* CPU Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">CPU Utilization</CardTitle>
            <CardDescription>Average CPU % across sessions</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && data.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : (
              <ChartContainer config={throughputConfig} className="h-[250px] w-full">
                <LineChart data={data} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="time" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    stroke="var(--color-cpu)"
                    strokeWidth={2}
                    dot={viewMode === "day"}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Network Breakdown */}
      {stats?.networkTypes && Object.keys(stats.networkTypes).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Network Type Distribution</CardTitle>
            <CardDescription>Connection types across telemetry events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.networkTypes).map(([type, count]) => (
                <Badge key={type} variant="secondary" className="text-xs px-3 py-1">
                  {type}: {count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── KPI Card ─────────────────────────────────────────────────

function KPICard({
  title,
  value,
  description,
  icon,
}: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  )
}
