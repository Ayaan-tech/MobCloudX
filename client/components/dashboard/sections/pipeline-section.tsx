"use client"

import { useEffect, useState } from "react"
import { TrendingUp, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface PipelineStage {
  name: string
  count: number
  percent: number
  detail: string
}

interface PipelineLink {
  source: string
  target: string
  value: number
}

interface PipelineResponse {
  success: boolean
  stages: PipelineStage[]
  links: PipelineLink[]
  health: {
    successRate: number
    activeJobs: number
    failedJobs: number
    avgDurationMinutes: number
    bottleneckCount: number
  }
}

export default function PipelineSection() {
  const [data, setData] = useState<PipelineResponse | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadData() {
      try {
        const res = await fetch("/api/pipeline", { cache: "no-store" })
        const json = await res.json()
        if (mounted && json.success) {
          setData(json)
        }
      } catch (e) {
        console.error("Failed to fetch pipeline stats", e)
      }
    }

    loadData()
    const interval = setInterval(loadData, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const stages = data?.stages ?? []
  const links = data?.links ?? []
  const maxLinkValue = Math.max(...links.map((link) => link.value), 1)

  return (
    <div>
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg font-medium">Pipeline Flow Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          {stages.length === 0 ? (
            <div className="h-96 bg-muted rounded-lg flex items-center justify-center text-muted-foreground">
              Waiting for live pipeline events...
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
              <div className="grid gap-4 lg:grid-cols-5">
                {stages.map((stage, index) => (
                  <div key={stage.name} className="relative">
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 shadow-lg shadow-sky-500/5">
                      <div className="text-xs uppercase tracking-[0.22em] text-sky-200/70">{stage.name}</div>
                      <div className="mt-3 text-3xl font-semibold text-white">{stage.count.toLocaleString()}</div>
                      <div className="mt-2 text-sm text-slate-300">{stage.detail}</div>
                      <div className="mt-4 h-2 rounded-full bg-slate-800">
                        <div
                          className="h-2 rounded-full bg-linear-to-r from-sky-500 via-cyan-400 to-emerald-400"
                          style={{ width: `${Math.max(stage.percent, 4)}%` }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-slate-400">{stage.percent.toFixed(1)}% of active flow</div>
                    </div>
                    {index < stages.length - 1 && (
                      <div className="hidden lg:flex items-center gap-2 absolute top-1/2 -right-9 translate-y-[-50%] w-16">
                        <div
                          className="h-2 rounded-full bg-linear-to-r from-cyan-400 to-sky-500"
                          style={{ width: `${Math.max(((links[index]?.value ?? 0) / maxLinkValue) * 64, 18)}px` }}
                        />
                        <span className="text-[10px] text-slate-500">{links[index]?.value ?? 0}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Pipeline Stages</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map((stage, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-sm">{stage.name}</div>
                    <div className="text-xs text-muted-foreground">{stage.detail}</div>
                  </div>
                </div>
                {i === 2 && <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />}
                <span className="text-sm font-semibold text-primary">{stage.percent.toFixed(1)}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Pipeline Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Overall Success Rate</span>
                <span className="font-medium text-primary">{data?.health.successRate?.toFixed(1) ?? "0.0"}%</span>
              </div>
              <Progress value={data?.health.successRate ?? 0} className="h-2" />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Active Pipeline Load</span>
                <span className="font-medium">{data?.health.activeJobs ?? 0} jobs</span>
              </div>
              <Progress value={Math.min((data?.health.activeJobs ?? 0) * 10, 100)} className="h-2" />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Avg Job Duration</span>
                <span className="font-medium">{data?.health.avgDurationMinutes?.toFixed(1) ?? "0.0"} min</span>
              </div>
              <Progress value={Math.max(0, 100 - (data?.health.avgDurationMinutes ?? 0) * 10)} className="h-2" />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Current Bottleneck</span>
                <span className="font-medium">{data?.health.bottleneckCount ?? 0} jobs</span>
              </div>
              <Progress value={Math.min((data?.health.bottleneckCount ?? 0) * 10, 100)} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
