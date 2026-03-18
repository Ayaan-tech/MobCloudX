"use client"

import React, { useState, useEffect, useRef } from "react"
import { ArrowRight, Monitor, Smartphone, Wifi, Signal, Play, BarChart3, Layers, Zap, TrendingUp, Activity } from "lucide-react"

// ── Types ──────────────────────────────────────────────────
interface ResolutionData {
  resolution: string
  width: number
  height: number
  bitrate: string
  fps: number
  vmaf: number
  vmafLabel: string
  qoe: number
  qoeLabel: string
  pipeline: string
  thumbnail: string
  preview?: string  // 2s video clip URL (local or S3)
}

interface ComparisonData {
  success: boolean
  original: ResolutionData
  enhanced: ResolutionData[]
  federatedLearning: {
    totalSessions: number
    bufferEvents: number
    adaptationDecisions: number
    avgFps: number
    networkDistribution: Record<string, number>
    totalTelemetryEvents: number
  }
  vmafStats: { resolution: string; avg: number; count: number }[]
  qoeSummary: { avg: number; total: number }
}

// ── Color helpers ──────────────────────────────────────────
function vmafColor(score: number) {
  if (score >= 90) return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", badge: "bg-emerald-500" }
  if (score >= 75) return { bg: "bg-green-500/20", text: "text-green-400", border: "border-green-500/30", badge: "bg-green-500" }
  if (score >= 60) return { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", badge: "bg-yellow-500" }
  return { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", badge: "bg-red-500" }
}

function qoeColor(score: number) {
  if (score >= 8.0) return { bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30", badge: "bg-emerald-500" }
  if (score >= 6.0) return { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", badge: "bg-blue-500" }
  if (score >= 4.0) return { bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-yellow-500/30", badge: "bg-yellow-500" }
  return { bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30", badge: "bg-red-500" }
}

// ── Score Badge Component ──────────────────────────────────
function ScoreBadge({ label, score, sublabel, colorFn }: { label: string; score: number; sublabel: string; colorFn: (s: number) => ReturnType<typeof vmafColor> }) {
  const c = colorFn(score)
  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${c.border} ${c.bg}`}>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <span className={`text-2xl font-bold ${c.text}`}>{score}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full ${c.badge} text-white font-medium`}>{sublabel}</span>
    </div>
  )
}

// ── Video Card Component ───────────────────────────────────
function VideoCard({
  data,
  title,
  isOriginal,
}: {
  data: ResolutionData
  title: string
  isOriginal?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoError, setVideoError] = useState(false)

  // Reload video when source changes
  useEffect(() => {
    setVideoError(false)
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [data.preview])

  const previewSrc = data.preview
  const hasVideo = !!previewSrc && !videoError

  return (
    <div className={`rounded-2xl border overflow-hidden transition-all duration-300 hover:shadow-xl ${
      isOriginal
        ? "border-red-500/20 bg-gradient-to-br from-red-950/30 via-card to-card"
        : "border-emerald-500/20 bg-gradient-to-br from-emerald-950/30 via-card to-card"
    }`}>
      {/* Header */}
      <div className={`px-5 py-3 border-b ${isOriginal ? "border-red-500/20 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
        <h3 className={`text-lg font-bold ${isOriginal ? "text-red-400" : "text-emerald-400"}`}>
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{data.width}×{data.height} • {data.bitrate} • {data.fps}fps</p>
      </div>

      {/* Video Playback / Fallback Image */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            controls
            poster={data.thumbnail}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setVideoError(true)}
          >
            <source src={previewSrc} type="video/mp4" />
          </video>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.thumbnail}
            alt={`${data.resolution} preview`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
          <div className={`px-2.5 py-1 rounded-lg text-xs font-bold backdrop-blur-md ${
            isOriginal ? "bg-red-500/80 text-white" : "bg-emerald-500/80 text-white"
          }`}>
            {data.resolution.toUpperCase()}
          </div>
          {hasVideo && (
            <div className="px-2 py-0.5 rounded-md text-[10px] font-medium backdrop-blur-md bg-white/15 text-white/80">
              FULL VIDEO
            </div>
          )}
        </div>
      </div>

      {/* Scores */}
      <div className="p-5 space-y-3">
        <div className="flex gap-3">
          <ScoreBadge label="VMAF" score={data.vmaf} sublabel={data.vmafLabel} colorFn={vmafColor} />
          <ScoreBadge label="QoE" score={data.qoe} sublabel={data.qoeLabel} colorFn={qoeColor} />
        </div>
        <p className={`text-sm ${isOriginal ? "text-red-300/80" : "text-emerald-300/80"}`}>
          {isOriginal
            ? `Blurry ${data.resolution} Video & Laggy Playback`
            : `Sharper Adaptive ${data.resolution} Video & Smooth Playback`
          }
        </p>
      </div>
    </div>
  )
}

// ── FL Metric Card ─────────────────────────────────────────
function FLMetricCard({ icon: Icon, label, value, sublabel }: { icon: any; label: string; value: string | number; sublabel?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────
export default function ComparisonSection() {
  const [data, setData] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedRes, setSelectedRes] = useState("720p")

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/comparison")
        const json = await res.json()
        if (json.success) setData(json)
      } catch (err) {
        console.error("Failed to fetch comparison data:", err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-muted-foreground text-sm">Loading comparison data…</span>
        </div>
      </div>
    )
  }

  // Fallback data if API fails
  const original: ResolutionData = data?.original ?? {
    resolution: "360p", width: 640, height: 360, bitrate: "325k", fps: 29.97,
    vmaf: 38, vmafLabel: "Poor", qoe: 5.2, qoeLabel: "Laggy",
    pipeline: "None (raw upload)", thumbnail: "/thumbnails/original-360p.jpg",
    preview: "https://s3.us-east-1.amazonaws.com/video-transcoding-mob.mobcloudx.xyz/videos/input.mp4",
  }

  const enhancedOptions = data?.enhanced ?? [
    { resolution: "480p", width: 854, height: 480, bitrate: "1500k", fps: 30, vmaf: 68, vmafLabel: "Fair", qoe: 6.5, qoeLabel: "Fair", pipeline: "ESRGAN → CAS", thumbnail: "/thumbnails/enhanced-480p.jpg", preview: "https://s3.us-east-1.amazonaws.com/prod-video.mobcloudx.xyz/video5-480p.mp4" },
    { resolution: "720p", width: 1280, height: 720, bitrate: "3500k", fps: 30, vmaf: 82, vmafLabel: "Good", qoe: 7.8, qoeLabel: "Good", pipeline: "ESRGAN → CAS", thumbnail: "/thumbnails/enhanced-720p.jpg", preview: "https://s3.us-east-1.amazonaws.com/prod-video.mobcloudx.xyz/video5-720p.mp4" },
    { resolution: "1080p", width: 1920, height: 1080, bitrate: "6000k", fps: 30, vmaf: 92, vmafLabel: "Excellent", qoe: 8.5, qoeLabel: "Smooth", pipeline: "ESRGAN → CAS", thumbnail: "/thumbnails/enhanced-1080p.jpg", preview: "https://s3.us-east-1.amazonaws.com/prod-video.mobcloudx.xyz/video5-1080p.mp4" },
  ]

  const selectedEnhanced = enhancedOptions.find(e => e.resolution === selectedRes) ?? enhancedOptions[1]
  const fl = data?.federatedLearning ?? { totalSessions: 12, bufferEvents: 3, adaptationDecisions: 7, avgFps: 29.8, networkDistribution: { wifi: 80, cellular: 20 }, totalTelemetryEvents: 156 }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Layers className="w-6 h-6 text-primary" />
            Before / After Quality Comparison
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Original upload vs ESRGAN-enhanced adaptive transcoding — powered by MobCloudX Pipeline
          </p>
        </div>
      </div>

      {/* Resolution Selector Tabs */}
      <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-xl w-fit">
        {enhancedOptions.map(e => (
          <button
            key={e.resolution}
            onClick={() => setSelectedRes(e.resolution)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedRes === e.resolution
                ? "bg-primary text-primary-foreground shadow-lg"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {e.resolution.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Original */}
        <VideoCard data={original} title="Original Upload" isOriginal />

        {/* Arrow */}
        <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          {/* Arrow is handled via CSS */}
        </div>

        {/* Enhanced */}
        <VideoCard data={selectedEnhanced} title={`Adaptive ${selectedRes.toUpperCase()}`} />
      </div>

      {/* Improvement Arrow Banner */}
      <div className="flex items-center justify-center gap-4 py-4">
        <div className="h-px flex-1 bg-linear-to-r from-transparent via-border to-transparent" />
        <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-primary/10 border border-primary/20">
          <TrendingUp className="w-5 h-5 text-primary" />
          <span className="text-sm font-medium text-foreground">
            VMAF improved <span className="text-primary font-bold">+{selectedEnhanced.vmaf - original.vmaf}</span> points
          </span>
          <ArrowRight className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            QoE improved <span className="text-primary font-bold">+{selectedEnhanced.qoe - original.qoe}</span> points
          </span>
        </div>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>

      {/* Comparison Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            Detailed Metrics Comparison
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-6 py-3 font-medium">Resolution</th>
                <th className="text-center px-4 py-3 font-medium">VMAF</th>
                <th className="text-center px-4 py-3 font-medium">QoE</th>
                <th className="text-center px-4 py-3 font-medium">Bitrate</th>
                <th className="text-center px-4 py-3 font-medium">FPS</th>
                <th className="text-left px-4 py-3 font-medium">Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {/* Original */}
              <tr className="border-b border-border/50 bg-red-500/5">
                <td className="px-6 py-3 font-medium text-red-400">{original.resolution} (original)</td>
                <td className="text-center px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">
                    {original.vmaf}
                  </span>
                </td>
                <td className="text-center px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-bold">
                    {original.qoe}
                  </span>
                </td>
                <td className="text-center px-4 py-3 text-muted-foreground">{original.bitrate}</td>
                <td className="text-center px-4 py-3 text-muted-foreground">{original.fps}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{original.pipeline}</td>
              </tr>
              {/* Enhanced */}
              {enhancedOptions.map(e => {
                const vc = vmafColor(e.vmaf)
                const qc = qoeColor(e.qoe)
                const isSelected = e.resolution === selectedRes
                return (
                  <tr
                    key={e.resolution}
                    className={`border-b border-border/50 cursor-pointer transition-colors ${
                      isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                    }`}
                    onClick={() => setSelectedRes(e.resolution)}
                  >
                    <td className={`px-6 py-3 font-medium ${isSelected ? "text-primary" : "text-emerald-400"}`}>
                      {e.resolution}
                      {isSelected && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">SELECTED</span>}
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${vc.bg} ${vc.text} text-xs font-bold`}>
                        {e.vmaf}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${qc.bg} ${qc.text} text-xs font-bold`}>
                        {e.qoe}
                      </span>
                    </td>
                    <td className="text-center px-4 py-3 text-muted-foreground">{e.bitrate}</td>
                    <td className="text-center px-4 py-3 text-muted-foreground">{e.fps}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{e.pipeline}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Federated Learning Metrics */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/30">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-400" />
            Federated Learning Metrics
          </h3>
          <p className="text-xs text-muted-foreground mt-1">Aggregated from SDK sessions — used for adaptive model training</p>
        </div>
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <FLMetricCard icon={Smartphone} label="Sessions" value={fl.totalSessions} sublabel="Active devices" />
          <FLMetricCard icon={Activity} label="Buffer Events" value={fl.bufferEvents} sublabel="Rebuffering detected" />
          <FLMetricCard icon={Layers} label="Adaptation Decisions" value={fl.adaptationDecisions} sublabel="Resolution switches" />
          <FLMetricCard icon={Monitor} label="Avg FPS" value={fl.avgFps} sublabel="Across all sessions" />
          <FLMetricCard icon={Wifi} label="Network" value={`${fl.networkDistribution.wifi ?? 0}%`} sublabel="WiFi / Cellular split" />
        </div>
        <div className="px-6 pb-6">
          <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <Signal className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Telemetry Pipeline Status</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm text-foreground">{fl.totalTelemetryEvents} events collected</span>
              </div>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                SDK → Producer → Kafka → Consumer → MongoDB Atlas
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
