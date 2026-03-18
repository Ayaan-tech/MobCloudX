"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
} from "recharts"

// ── Chart Configs ────────────────────────────────────────────

const clusterConfig = {
  qoe: { label: "QoE Score", color: "var(--chart-1)" },
} satisfies ChartConfig

const metricsConfig = {
  qoe: { label: "Avg QoE Score", color: "var(--chart-2)" },
  success: { label: "Success Rate %", color: "var(--chart-1)" },
} satisfies ChartConfig

// ── Data ─────────────────────────────────────────────────────

const clusterData = [
  { duration: 120, qoe: 8.2, size: 450 },
  { duration: 145, qoe: 8.7, size: 520 },
  { duration: 98, qoe: 7.8, size: 380 },
  { duration: 167, qoe: 9.1, size: 610 },
  { duration: 134, qoe: 8.5, size: 490 },
  { duration: 156, qoe: 8.9, size: 560 },
  { duration: 189, qoe: 9.3, size: 680 },
  { duration: 123, qoe: 8.1, size: 440 },
  { duration: 145, qoe: 8.6, size: 530 },
  { duration: 178, qoe: 9.2, size: 640 },
]

const metricsData = [
  { week: "Week 1", qoe: 8.3, success: 97.5 },
  { week: "Week 2", qoe: 8.5, success: 98.1 },
  { week: "Week 3", qoe: 8.7, success: 98.3 },
  { week: "Week 4", qoe: 8.9, success: 98.5 },
]

const correlationLabels = ["Bitrate", "Resolution", "Encode Time", "File Size", "CPU Usage"]
const correlationData = [
  [1.0, 0.85, -0.62, 0.73, -0.45],
  [0.85, 1.0, -0.58, 0.68, -0.52],
  [-0.62, -0.58, 1.0, -0.41, 0.78],
  [0.73, 0.68, -0.41, 1.0, -0.33],
  [-0.45, -0.52, 0.78, -0.33, 1.0],
]

function getCorrelationColor(v: number): string {
  if (v >= 0.7) return "hsl(142, 71%, 45%)"
  if (v >= 0.3) return "hsl(142, 40%, 35%)"
  if (v >= -0.3) return "hsl(0, 0%, 30%)"
  if (v >= -0.7) return "hsl(0, 40%, 40%)"
  return "hsl(0, 72%, 50%)"
}

// ── Component ────────────────────────────────────────────────

export default function AnalyticsSection() {
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Correlation Matrix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">QoE Factor Correlation Matrix</CardTitle>
            <CardDescription>Pairwise correlation between transcoding factors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="py-1 px-2"></th>
                    {correlationLabels.map((l) => (
                      <th key={l} className="py-1 px-2 text-muted-foreground font-medium text-center">{l.slice(0, 6)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {correlationLabels.map((row, ri) => (
                    <tr key={row}>
                      <td className="py-1 px-2 text-muted-foreground font-medium">{row}</td>
                      {correlationData[ri].map((val, ci) => (
                        <td key={ci} className="py-1 px-2 text-center">
                          <div
                            className="inline-flex items-center justify-center w-10 h-8 rounded text-xs font-mono font-medium"
                            style={{ backgroundColor: getCorrelationColor(val), color: Math.abs(val) > 0.5 ? "#fff" : "inherit" }}
                          >
                            {val.toFixed(2)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Performance Clusters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Job Performance Clusters</CardTitle>
            <CardDescription>Duration vs QoE score scatter</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={clusterConfig} className="h-[280px] w-full">
              <ScatterChart accessibilityLayer margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="duration" name="Duration (s)" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis dataKey="qoe" name="QoE" tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Scatter name="Jobs" data={clusterData}>
                  {clusterData.map((entry, i) => (
                    <Cell key={i} fill={entry.qoe > 8.5 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Metrics Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Performance Metrics Over Time</CardTitle>
          <CardDescription>Weekly trend of QoE and success rate</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={metricsConfig} className="h-[280px] w-full">
            <LineChart data={metricsData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="qoe" stroke="var(--color-qoe)" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="success" stroke="var(--color-success)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
