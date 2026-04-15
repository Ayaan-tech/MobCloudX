"use client"

import { useState, useEffect } from "react"
import { GitBranch, Zap, Brain, Clock } from "lucide-react"
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
  ScatterChart,
  Scatter,
  Line,
  LineChart,
} from "recharts"

// ── Types ────────────────────────────────────────────────────

interface AdaptationDecision {
  sessionId: string
  decision: string
  target_resolution?: number
  target_bitrate?: number
  reason: string
  confidence: number
  ts: number
  model_version?: string
  inference_latency_ms?: number
}

interface AdaptationFeedback {
  sessionId: string
  decision: string
  applied: boolean
  qoe_before: number
  qoe_after: number
  ts: number
}

// ── Chart Configs ────────────────────────────────────────────

const decisionTypeConfig = {
  count: { label: "Decisions", color: "var(--chart-1)" },
} satisfies ChartConfig

const feedbackConfig = {
  qoe_before: { label: "QoE Before", color: "var(--chart-5)" },
  qoe_after: { label: "QoE After", color: "var(--chart-2)" },
} satisfies ChartConfig

// ── Component ────────────────────────────────────────────────

export default function AdaptationPanel() {
  const [decisions, setDecisions] = useState<AdaptationDecision[]>([])
  const [feedback, setFeedback] = useState<AdaptationFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/adaptation?limit=200', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!mounted) return

        setDecisions(Array.isArray(json.decisions) ? json.decisions : [])
        setFeedback(Array.isArray(json.feedback) ? json.feedback : [])
        setError(null)
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : 'Failed to load adaptation data')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 10000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  const hasData = decisions.length > 0
  const displayDecisions = decisions
  const displayFeedback = feedback

  // Aggregate decision counts by type
  const decisionCounts = displayDecisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.decision] = (acc[d.decision] || 0) + 1
    return acc
  }, {})

  const decisionChartData = Object.entries(decisionCounts).map(([decision, count]) => ({
    decision: decision.replace(/_/g, " "),
    count,
  }))

  // Feedback impact chart
  const feedbackChartData = displayFeedback.map((f, i) => ({
    index: i + 1,
    qoe_before: f.qoe_before,
    qoe_after: f.qoe_after,
    decision: f.decision.replace(/_/g, " "),
    applied: f.applied,
  }))

  // KPIs
  const totalDecisions = displayDecisions.length
  const avgConfidence = displayDecisions.length > 0
    ? displayDecisions.reduce((sum, d) => sum + d.confidence, 0) / displayDecisions.length
    : 0
  const avgLatency = displayDecisions.length > 0
    ? displayDecisions.reduce((sum, d) => sum + (d.inference_latency_ms ?? 0), 0) / displayDecisions.length
    : 0
  const appliedCount = displayFeedback.filter((f) => f.applied).length
  const baseTotalFeedback = displayFeedback.length
  const appliedPct = baseTotalFeedback > 0 ? ((appliedCount / baseTotalFeedback) * 100).toFixed(0) : "0"

  // Avg QoE improvement
  const appliedFeedbackArr = displayFeedback.filter((f) => f.applied)
  const avgImprovement = appliedFeedbackArr.length > 0
    ? appliedFeedbackArr.reduce((sum, f) => sum + (f.qoe_after - f.qoe_before), 0) / appliedFeedbackArr.length
    : 0

  if (loading && !hasData) {
    return <div className="text-sm text-muted-foreground">Loading adaptation data...</div>
  }

  if (error && !hasData) {
    return <div className="text-sm text-red-500">Failed to load adaptation data: {error}</div>
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Decisions</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDecisions}</div>
            <p className="text-xs text-muted-foreground mt-1">From adaptation agent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Confidence</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(avgConfidence * 100).toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Model decision confidence</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Applied Rate</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{appliedPct}%</div>
            <p className="text-xs text-muted-foreground mt-1">{appliedCount} of {displayFeedback.length} feedback events</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Latency</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgLatency.toFixed(0)}<span className="text-sm font-normal text-muted-foreground"> ms</span></div>
            <p className="text-xs text-muted-foreground mt-1">Inference round-trip</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Decision Type Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Decision Types</CardTitle>
            <CardDescription>Distribution of adaptation actions</CardDescription>
          </CardHeader>
          <CardContent>
            {decisionChartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No adaptation decisions recorded yet.
              </div>
            ) : (
              <ChartContainer config={decisionTypeConfig} className="h-[260px] w-full">
                <BarChart data={decisionChartData} accessibilityLayer layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis dataKey="decision" type="category" tickLine={false} axisLine={false} fontSize={11} width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 6, 6, 0]} barSize={24} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Feedback Impact */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-medium">QoE Impact</CardTitle>
                <CardDescription>Before vs after adaptation</CardDescription>
              </div>
              <Badge variant={avgImprovement > 0 ? "default" : "destructive"} className="text-xs">
                {avgImprovement > 0 ? "+" : ""}{avgImprovement.toFixed(1)} avg
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {feedbackChartData.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                No adaptation feedback recorded yet.
              </div>
            ) : (
              <ChartContainer config={feedbackConfig} className="h-[260px] w-full">
                <BarChart data={feedbackChartData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="decision" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} domain={[0, 100]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="qoe_before" fill="var(--color-qoe_before)" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="qoe_after" fill="var(--color-qoe_after)" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Decisions Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Decisions</CardTitle>
          <CardDescription>Latest adaptation agent activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Time</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Session</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Decision</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Target</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Confidence</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Reason</th>
                </tr>
              </thead>
              <tbody>
                {displayDecisions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No adaptation decisions have been written yet.
                    </td>
                  </tr>
                ) : (
                  displayDecisions.slice(-10).reverse().map((d, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-3 text-xs text-muted-foreground font-mono">
                        {new Date(d.ts).toLocaleTimeString()}
                      </td>
                      <td className="py-2 px-3 text-xs font-mono">{d.sessionId.slice(0, 8)}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="text-xs">{d.decision.replace(/_/g, " ")}</Badge>
                      </td>
                      <td className="py-2 px-3 text-xs">{d.target_resolution ? `${d.target_resolution}p` : "—"}</td>
                      <td className="py-2 px-3 text-xs">
                        <span className={d.confidence >= 0.8 ? "text-green-500" : d.confidence >= 0.6 ? "text-yellow-500" : "text-red-500"}>
                          {(d.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground max-w-[200px] truncate">{d.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
