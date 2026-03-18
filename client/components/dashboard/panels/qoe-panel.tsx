"use client"

import { useState, useEffect, useCallback } from "react"
import { Gauge, TrendingUp, TrendingDown, BarChart3 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts"

// ── Types ────────────────────────────────────────────────────

interface QoEChartData {
  range: string
  jobs: number
}

interface QoEApiResponse {
  success: boolean
  data: QoEChartData[]
  totalRecords: number
  validRecords: number
  invalidRecords: number
}

// ── Chart Configs ────────────────────────────────────────────

const distributionConfig = {
  jobs: { label: "Sessions", color: "var(--chart-1)" },
} satisfies ChartConfig

// ── Helpers ──────────────────────────────────────────────────

function getRangeColor(range: string): string {
  const start = parseInt(range.split("-")[0], 10)
  if (start >= 8) return "hsl(142, 71%, 45%)"    // green
  if (start >= 6) return "hsl(84, 81%, 44%)"     // lime
  if (start >= 4) return "hsl(48, 96%, 53%)"     // yellow
  if (start >= 2) return "hsl(25, 95%, 53%)"     // orange
  return "hsl(0, 84%, 60%)"                       // red
}

// ── Component ────────────────────────────────────────────────

export default function QoEPanel() {
  const [data, setData] = useState<QoEChartData[]>([])
  const [totalRecords, setTotalRecords] = useState(0)
  const [validRecords, setValidRecords] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/qoe", { cache: "no-store" })
      const json: QoEApiResponse = await res.json()
      if (json.success) {
        setData(json.data ?? [])
        setTotalRecords(json.totalRecords)
        setValidRecords(json.validRecords)
      }
    } catch (err) {
      console.error("QoE fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  // Compute summary stats
  const totalJobs = data.reduce((sum, d) => sum + d.jobs, 0)
  const highQoE = data.filter((d) => parseInt(d.range) >= 8).reduce((s, d) => s + d.jobs, 0)
  const lowQoE = data.filter((d) => parseInt(d.range) < 4).reduce((s, d) => s + d.jobs, 0)
  const highPct = totalJobs > 0 ? ((highQoE / totalJobs) * 100).toFixed(1) : "0"
  const lowPct = totalJobs > 0 ? ((lowQoE / totalJobs) * 100).toFixed(1) : "0"

  // Weighted average QoE
  let weightedAvg = 0
  if (totalJobs > 0) {
    const weightedSum = data.reduce((sum, d) => {
      const mid = d.range.split("-").map(Number)
      return sum + ((mid[0] + mid[1]) / 2) * d.jobs
    }, 0)
    weightedAvg = weightedSum / totalJobs
  }

  const gaugeData = [{ value: weightedAvg * 10, fill: weightedAvg >= 7 ? "hsl(142, 71%, 45%)" : weightedAvg >= 5 ? "hsl(48, 96%, 53%)" : "hsl(0, 84%, 60%)" }]

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg QoE</CardTitle>
            <Gauge className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weightedAvg.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">/10</span></div>
            <p className="text-xs text-muted-foreground mt-1">Weighted average score</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Sessions</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{validRecords} valid records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">High QoE (8+)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{highPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">{highQoE} sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Low QoE (&lt;4)</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{lowPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">{lowQoE} sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution + Gauge */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Distribution Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">QoE Score Distribution</CardTitle>
              <CardDescription>Sessions grouped by score range (0–10)</CardDescription>
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="h-7 px-2.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
            >
              {loading ? "..." : "Refresh"}
            </button>
          </CardHeader>
          <CardContent>
            {loading && data.every((d) => d.jobs === 0) ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <ChartContainer config={distributionConfig} className="h-[280px] w-full">
                <BarChart data={data} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="jobs" radius={[6, 6, 0, 0]}>
                    {data.map((entry, i) => (
                      <Cell key={i} fill={getRangeColor(entry.range)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Radial Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Overall Score</CardTitle>
            <CardDescription>Aggregate QoE gauge</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <div className="relative h-[200px] w-[200px]">
              <RadialBarChart
                width={200}
                height={200}
                cx={100}
                cy={100}
                innerRadius={70}
                outerRadius={90}
                barSize={12}
                data={gaugeData}
                startAngle={225}
                endAngle={-45}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar
                  background
                  dataKey="value"
                  cornerRadius={8}
                  fill={gaugeData[0].fill}
                />
              </RadialBarChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{weightedAvg.toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">out of 10</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
