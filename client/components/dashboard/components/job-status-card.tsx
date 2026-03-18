import type { LucideIcon } from "lucide-react"

interface JobStatusCardProps {
  title: string
  value: string
  change: string
  icon: LucideIcon
  color: string
}

export default function JobStatusCard({ title, value, change, icon: Icon, color }: JobStatusCardProps) {
  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-indigo-400 font-medium">{title}</span>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="text-3xl mb-2 font-semibold">{value}</div>
      <div className={`text-xs font-medium ${change.includes("failure") ? "text-red-400" : "text-cyan-400"}`}>
        {change}
      </div>
    </div>
  )
}
