"use client"

import { TrendingUp, CheckCircle, XCircle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import RecentJobsTable from "../components/recent-jobs-table"
import QoEPanel from "../panels/qoe-panel"
import TelemetryPanel from "../panels/telemetry-panel"

export default function OverviewSection() {
  return (
    <div className="space-y-6">
      {/* Status KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverviewKPI
          title="Total Jobs"
          value="15,847"
          change="+12.5% from last month"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          positive
        />
        <OverviewKPI
          title="Succeeded"
          value="15,609"
          change="98.5% success rate"
          icon={<CheckCircle className="h-4 w-4 text-green-500" />}
          positive
        />
        <OverviewKPI
          title="Failed"
          value="186"
          change="1.2% failure rate"
          icon={<XCircle className="h-4 w-4 text-red-500" />}
          positive={false}
        />
        <OverviewKPI
          title="In Progress"
          value="52"
          change="Currently processing"
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          positive
        />
      </div>

      {/* Recent Jobs */}
      <RecentJobsTable />
    </div>
  )
}

function OverviewKPI({
  title,
  value,
  change,
  icon,
  positive,
}: {
  title: string
  value: string
  change: string
  icon: React.ReactNode
  positive: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className={`text-xs mt-1 ${positive ? "text-muted-foreground" : "text-red-500"}`}>
          {change}
        </p>
      </CardContent>
    </Card>
  )
}
