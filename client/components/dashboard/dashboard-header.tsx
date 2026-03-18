"use client"

import { Bell } from "lucide-react"

interface DashboardHeaderProps {
  title: string
  subtitle: string
  onLogout: () => void
}

export default function DashboardHeader({ title, subtitle, onLogout }: DashboardHeaderProps) {
  return (
    <header className="bg-background border-b border-border sticky top-0 z-30">
      <div className="px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-accent rounded-lg transition relative">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full"></span>
          </button>
          <button
            onClick={onLogout}
            className="px-3.5 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md text-sm transition font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  )
}
