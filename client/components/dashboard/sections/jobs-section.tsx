"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface JobDisplay {
  id: string
  sessionId: string
  status: string
  time: string
  videoKey: string
  duration?: string
  qoe: string
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "COMPLETED":
      return "default"
    case "FAILED":
      return "destructive"
    case "STARTED":
    case "RUNNING":
    case "IN_PROGRESS":
      return "secondary"
    default:
      return "outline"
  }
}

export default function AllJobsSection() {
  const [jobs, setJobs] = useState<JobDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchRecentJobs()
  }, [])

  const fetchRecentJobs = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/jobs/recent?limit=10")
      const result = await response.json()

      if (result.success) {
        setJobs(result.jobs)
      } else {
        setError(result.error || "Failed to fetch jobs")
      }
    } catch (err) {
      console.error("Error fetching jobs:", err)
      setError("Failed to load recent jobs")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">All Jobs</CardTitle>
        <button
          onClick={fetchRecentJobs}
          className="text-xs text-primary hover:text-primary/80 font-medium"
        >
          Refresh
        </button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading jobs…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-destructive text-sm">
            {error}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Session</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Video</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Time</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Duration</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">QoE</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                      No jobs found
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      <td className="py-2 px-3 text-xs font-mono">{job.sessionId}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{job.videoKey}</td>
                      <td className="py-2 px-3">
                        <Badge variant={getStatusVariant(job.status)} className="text-[10px]">
                          {job.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{job.time}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{job.duration || "—"}</td>
                      <td className="py-2 px-3 text-xs font-medium">{job.qoe}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
