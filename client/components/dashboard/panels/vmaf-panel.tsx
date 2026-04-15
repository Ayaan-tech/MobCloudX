"use client"

import { useState, useEffect, useCallback } from "react"
import { Eye, TrendingUp, TrendingDown, BarChart3, Activity, Monitor } from "lucide-react"
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

interface VMAFDistBucket {
  range: string
  count: number
}

interface VMAFResolutionStat {
  resolution: string
  avg: number
  min: number
  max: number
  count: number
}

interface VMAFRecentScore {
  sessionId: string
  vmaf_score: number
  resolution: string
  ts: string
  quality: string
}

interface VMAFApiResponse {
  success: boolean
  summary: {
    total: number
    avg: number
    min: number
    max: number
    median: number
  }
  distribution: VMAFDistBucket[]
  resolutionStats: VMAFResolutionStat[]
  qualityDistribution: {
    excellent: number
    good: number
    fair: number
    poor: number
  }
  recentScores: VMAFRecentScore[]
}

// ── Chart Config ─────────────────────────────────────────────

const vmafDistConfig = {
  count: { label: "Scores", color: "var(--chart-2)" },
} satisfies ChartConfig

const resConfig = {
  avg: { label: "Avg VMAF", color: "var(--chart-3)" },
} satisfies ChartConfig

// ── Helpers ──────────────────────────────────────────────────

function getVMAFColor(score: number): string {
  if (score >= 93) return "hsl(142, 71%, 45%)"     // green — excellent
  if (score >= 80) return "hsl(84, 81%, 44%)"      // lime — good
  if (score >= 60) return "hsl(48, 96%, 53%)"      // yellow — fair
  return "hsl(0, 84%, 60%)"                         // red — poor
}

function getBucketColor(range: string): string {
  const start = parseInt(range.split("-")[0], 10)
  if (start >= 90) return "hsl(142, 71%, 45%)"
  if (start >= 70) return "hsl(84, 81%, 44%)"
  if (start >= 50) return "hsl(48, 96%, 53%)"
  if (start >= 30) return "hsl(25, 95%, 53%)"
  return "hsl(0, 84%, 60%)"
}

function qualityBadgeVariant(quality: string): "default" | "secondary" | "destructive" | "outline" {
  switch (quality) {
    case "Excellent": return "default"
    case "Good": return "secondary"
    case "Fair": return "outline"
    case "Poor": return "destructive"
    default: return "outline"
  }
}

// ── Component ────────────────────────────────────────────────

export default function VMAFPanel() {
  const [data, setData] = useState<VMAFApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/vmaf", { cache: "no-store" })
      const json: VMAFApiResponse = await res.json()
      if (json.success) {
        setData(json)
      }
    } catch (err) {
      console.error("VMAF fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  const hasData = (data?.summary?.total ?? 0) > 0
  const displayData = data
  const summary = displayData?.summary ?? { total: 0, avg: 0, min: 0, max: 0, median: 0 }
  const qualDist = displayData?.qualityDistribution ?? { excellent: 0, good: 0, fair: 0, poor: 0 }
  const totalQual = qualDist.excellent + qualDist.good + qualDist.fair + qualDist.poor
  const excellentPct = totalQual > 0 ? ((qualDist.excellent / totalQual) * 100).toFixed(1) : "0"
  const poorPct = totalQual > 0 ? ((qualDist.poor / totalQual) * 100).toFixed(1) : "0"

  const gaugeData = [
    {
      value: summary.avg,
      fill: getVMAFColor(summary.avg),
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg VMAF</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: getVMAFColor(summary.avg) }}>
              {summary.avg.toFixed(1)}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Perceptual quality (Netflix VMAF)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Median</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.median.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Range: {summary.min.toFixed(0)}–{summary.max.toFixed(0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Scores</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">VMAF evaluations run</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Excellent (93+)
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{excellentPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">{qualDist.excellent} sessions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Poor (&lt;60)</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{poorPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">{qualDist.poor} sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* VMAF Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">VMAF Score Distribution</CardTitle>
              <CardDescription>
                Perceptual quality scores (0–100, higher = better)
              </CardDescription>
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
            {loading && !hasData ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                Loading...
              </div>
            ) : !displayData || displayData.distribution.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
                No VMAF scores available yet.
              </div>
            ) : (
              <ChartContainer config={vmafDistConfig} className="h-[280px] w-full">
                <BarChart data={displayData.distribution} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {displayData.distribution.map((entry, i) => (
                      <Cell key={i} fill={getBucketColor(entry.range)} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* VMAF Gauge */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Overall VMAF</CardTitle>
            <CardDescription>Average perceptual quality</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={vmafDistConfig} className="h-[200px] w-[200px]">
              <RadialBarChart
                data={gaugeData}
                innerRadius="70%"
                outerRadius="100%"
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={8} />
                <text x="50%" y="55%" textAnchor="middle" className="text-2xl font-bold fill-foreground">
                  {summary.avg.toFixed(1)}
                </text>
                <text x="50%" y="70%" textAnchor="middle" className="text-xs fill-muted-foreground">
                  / 100
                </text>
              </RadialBarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Per-Resolution Breakdown */}
      {displayData && displayData.resolutionStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">VMAF by Resolution</CardTitle>
            <CardDescription>Average perceptual quality per output resolution</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={resConfig} className="h-[220px] w-full">
              <BarChart data={displayData.resolutionStats} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="resolution" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                  {displayData.resolutionStats.map((entry, i) => (
                    <Cell key={i} fill={getVMAFColor(entry.avg)} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent VMAF Scores Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent VMAF Evaluations</CardTitle>
          <CardDescription>Latest perceptual quality measurements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Session</th>
                  <th className="text-left py-2 px-3 font-medium">Resolution</th>
                  <th className="text-right py-2 px-3 font-medium">VMAF</th>
                  <th className="text-left py-2 px-3 font-medium">Quality</th>
                  <th className="text-left py-2 px-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {displayData?.recentScores?.map((score, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                    <td className="py-2 px-3 font-mono text-xs truncate max-w-[180px]">
                      {score.sessionId}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant="outline">{score.resolution}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-bold" style={{ color: getVMAFColor(score.vmaf_score) }}>
                      {score.vmaf_score.toFixed(1)}
                    </td>
                    <td className="py-2 px-3">
                      <Badge variant={qualityBadgeVariant(score.quality)}>{score.quality}</Badge>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">
                      {score.ts ? new Date(score.ts).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
                {(!displayData || displayData.recentScores.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">
                      No VMAF scores yet. Scores will appear after transcoding with VMAF enabled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
