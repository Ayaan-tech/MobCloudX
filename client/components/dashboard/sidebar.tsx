"use client"

import { Cloud, LayoutGrid, Download, BarChart3, Sparkles, Zap, Settings, ChevronLeft, Activity, Gauge, GitBranch, Eye, GitCompareArrows } from "lucide-react"

interface SidebarProps {
  currentSection: string
  onSectionChange: (section: any) => void
  expanded: boolean
  onToggle: () => void
}

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "telemetry", label: "Telemetry", icon: Activity },
  { id: "qoe", label: "QoE Scores", icon: Gauge },
  { id: "vmaf", label: "VMAF Quality", icon: Eye },
  { id: "adaptation", label: "Adaptation", icon: GitBranch },
  { id: "jobs", label: "Jobs", icon: Download },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "insights", label: "AI Insights", icon: Sparkles },
  { id: "pipeline", label: "Pipeline", icon: Zap },
  { id: "comparison", label: "Before/After", icon: GitCompareArrows },
]

export default function Sidebar({ currentSection, onSectionChange, expanded, onToggle }: SidebarProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40 ${
        expanded ? "w-64" : "w-16"
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <div className="flex items-center overflow-hidden">
          <Cloud className="w-6 h-6 text-sidebar-primary shrink-0" />
          {expanded && <span className="ml-3 whitespace-nowrap font-semibold text-sidebar-foreground">mobCloudX</span>}
        </div>
        <button onClick={onToggle} className="p-1 hover:bg-sidebar-accent rounded">
          <ChevronLeft className="w-5 h-5 text-sidebar-foreground" />
        </button>
      </div>

      <nav className="p-3 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center px-3 py-2 rounded-lg text-sm transition-colors ${
                currentSection === item.id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {expanded && <span className="ml-3">{item.label}</span>}
            </button>
          )
        })}
        <div className="border-t border-sidebar-border my-3"></div>
        <button className="w-full flex items-center px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <Settings className="w-4 h-4 shrink-0" />
          {expanded && <span className="ml-3">Settings</span>}
        </button>
      </nav>

      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border bg-sidebar">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-xs shrink-0 font-medium text-primary-foreground">
            JD
          </div>
          {expanded && (
            <div className="ml-3 overflow-hidden">
              <div className="text-sm truncate font-medium text-sidebar-foreground">John Doe</div>
              <div className="text-xs text-muted-foreground truncate">john@company.com</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
