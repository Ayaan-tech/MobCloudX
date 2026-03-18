"use client"

import { useState } from "react"
import Sidebar from "./sidebar"
import DashboardHeader from "./dashboard-header"
import OverviewSection from "./sections/overview-section"
import AllJobsSection from "./sections/jobs-section"
import AnalyticsSection from "./sections/unified-analytics-section"
import AIInsightsChat from "./sections/quality-section"
import PipelineSection from "./sections/pipeline-section"
import TelemetryPanel from "./panels/telemetry-panel"
import QoEPanel from "./panels/qoe-panel"
import AdaptationPanel from "./panels/adaptation-panel"
import VMAFPanel from "./panels/vmaf-panel"
import ComparisonSection from "./sections/comparison-section"

interface DashboardPageProps {
  onLogout: () => void
}

type DashboardSection = "overview" | "telemetry" | "qoe" | "vmaf" | "adaptation" | "jobs" | "analytics" | "insights" | "pipeline" | "comparison"

export default function DashboardPage({ onLogout }: DashboardPageProps) {
  const [currentSection, setCurrentSection] = useState<DashboardSection>("overview")
  const [sidebarExpanded, setSidebarExpanded] = useState(true)

  const sectionTitles: Record<DashboardSection, { title: string; subtitle: string }> = {
    overview: { title: "Overview", subtitle: "Monitor your transcoding pipeline performance" },
    telemetry: { title: "Telemetry", subtitle: "Real-time device and network telemetry from SDK sessions" },
    qoe: { title: "QoE Scores", subtitle: "Quality of Experience distribution and trends" },
    vmaf: { title: "VMAF Quality", subtitle: "Netflix VMAF perceptual video quality scores" },
    adaptation: { title: "Adaptation Agent", subtitle: "AI-driven bitrate and resolution adaptation decisions" },
    jobs: { title: "Jobs", subtitle: "View and manage all transcoding jobs" },
    analytics: { title: "Analytics", subtitle: "Deep dive into performance metrics" },
    insights: { title: "AI Insights", subtitle: "AI-powered quality analysis and recommendations" },
    pipeline: { title: "Pipeline", subtitle: "Visualize job flow and pipeline health" },
    comparison: { title: "Before / After", subtitle: "Compare original vs ESRGAN-enhanced quality with VMAF, QoE, and FL metrics" },
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
      />
      <main className={`transition-all duration-300 ${sidebarExpanded ? "ml-64" : "ml-16"}`}>
        <DashboardHeader
          title={sectionTitles[currentSection].title}
          subtitle={sectionTitles[currentSection].subtitle}
          onLogout={onLogout}
        />
        <div className="p-6">
          {currentSection === "overview" && <OverviewSection />}
          {currentSection === "telemetry" && <TelemetryPanel />}
          {currentSection === "qoe" && <QoEPanel />}
          {currentSection === "vmaf" && <VMAFPanel />}
          {currentSection === "adaptation" && <AdaptationPanel />}
          {currentSection === "jobs" && <AllJobsSection />}
          {currentSection === "analytics" && <AnalyticsSection />}
          {currentSection === "insights" && <AIInsightsChat />}
          {currentSection === "pipeline" && <PipelineSection />}
          {currentSection === "comparison" && <ComparisonSection />}
        </div>
      </main>
    </div>
  )
}
