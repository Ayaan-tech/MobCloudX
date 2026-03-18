"use client"

import { Badge } from "@/components/ui/badge"

// ── Types ────────────────────────────────────────────────────

interface QualitySide {
  resolution: string
  vmaf: number
  qoe: number
  qualityLabel: string
  qualityLabel: string
  description: string
  preview: string
}

interface QualityComparisonCardProps {
  before: QualitySide
  after: QualitySide
}

// ── Helpers ──────────────────────────────────────────────────

function getVMAFColor(score: number): string {
  if (score >= 93) return "hsl(142, 71%, 45%)"
  if (score >= 80) return "hsl(84, 81%, 44%)"
  if (score >= 60) return "hsl(48, 96%, 53%)"
  return "hsl(0, 84%, 60%)"
}

function getVMAFLabel(score: number): string {
  if (score >= 93) return "Excellent"
  if (score >= 80) return "Good"
  if (score >= 60) return "Fair"
  return "Poor"
}

function getQoELabel(score: number): string {
  if (score >= 80) return "Smooth"
  if (score >= 60) return "Acceptable"
  if (score >= 40) return "Laggy"
  return "Unwatchable"
}

function scoreBadgeVariant(
  label: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (label) {
    case "Excellent":
    case "Smooth":
      return "default"
    case "Good":
    case "Acceptable":
      return "secondary"
    case "Fair":
    case "Laggy":
      return "outline"
    default:
      return "destructive"
  }
}

// ── Component ────────────────────────────────────────────────

export default function QualityComparisonCard({
  before,
  after,
}: QualityComparisonCardProps) {
  const vmafLabelBefore = getVMAFLabel(before.vmaf)
  const vmafLabelAfter = getVMAFLabel(after.vmaf)
  const qoeLabelBefore = getQoELabel(before.qoe)
  const qoeLabelAfter = getQoELabel(after.qoe)

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0 items-stretch">
      {/* ── Before ──────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-red-950/40 to-orange-950/30 border border-red-500/20 rounded-xl p-6 flex flex-col items-center gap-4">
        <h3 className="text-lg font-bold text-yellow-400">{before.resolution}</h3>

        {/* Video Player */}
        <div className="w-full aspect-video rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 relative overflow-hidden group">
          <video
            src={before.preview}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 flex items-center gap-2 rounded-md border border-white/10">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-white tracking-wider">LIVE PREVIEW</span>
          </div>
        </div>

        {/* Score badges */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">VMAF</span>
            <span
              className="text-xl font-black px-3 py-1 rounded-md"
              style={{ backgroundColor: getVMAFColor(before.vmaf), color: "#fff" }}
            >
              {before.vmaf}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">QoE</span>
            <span
              className="text-xl font-black px-3 py-1 rounded-md"
              style={{ backgroundColor: getVMAFColor(before.qoe), color: "#fff" }}
            >
              {before.qoe}
            </span>
          </div>
        </div>

        {/* Quality labels */}
        <div className="flex gap-3">
          <Badge variant={scoreBadgeVariant(vmafLabelBefore)}>{vmafLabelBefore}</Badge>
          <Badge variant={scoreBadgeVariant(qoeLabelBefore)}>{qoeLabelBefore}</Badge>
        </div>

        <p className="text-sm text-muted-foreground italic text-center">
          {before.description}
        </p>
      </div>

      {/* ── Arrow ──────────────────────────────── */}
      <div className="hidden md:flex items-center justify-center px-4">
        <span className="text-3xl font-bold text-cyan-400">»</span>
      </div>
      <div className="md:hidden flex items-center justify-center py-2">
        <span className="text-2xl font-bold text-cyan-400">▼</span>
      </div>

      {/* ── After ──────────────────────────────── */}
      <div className="relative bg-gradient-to-br from-emerald-950/40 to-cyan-950/30 border border-emerald-500/20 rounded-xl p-6 flex flex-col items-center gap-4">
        <h3 className="text-lg font-bold text-green-400">{after.resolution}</h3>

        {/* Video Player */}
        <div className="w-full aspect-video rounded-lg bg-gradient-to-br from-blue-900/30 to-emerald-900/20 border border-white/10 relative overflow-hidden group">
          <video
            src={after.preview}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md px-2 py-1 flex items-center gap-2 rounded-md border border-white/10">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-bold text-white tracking-wider">LIVE PREVIEW</span>
          </div>
        </div>

        {/* Score badges */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">VMAF</span>
            <span
              className="text-xl font-black px-3 py-1 rounded-md"
              style={{ backgroundColor: getVMAFColor(after.vmaf), color: "#fff" }}
            >
              {after.vmaf}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">QoE</span>
            <span
              className="text-xl font-black px-3 py-1 rounded-md"
              style={{ backgroundColor: getVMAFColor(after.qoe), color: "#fff" }}
            >
              {after.qoe}
            </span>
          </div>
        </div>

        {/* Quality labels */}
        <div className="flex gap-3">
          <Badge variant={scoreBadgeVariant(vmafLabelAfter)}>{vmafLabelAfter}</Badge>
          <Badge variant={scoreBadgeVariant(qoeLabelAfter)}>{qoeLabelAfter}</Badge>
        </div>

        <p className="text-sm text-muted-foreground italic text-center">
          {after.description}
        </p>
      </div>
    </div>
  )
}
