"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

const data = [
  { week: "Week 1", qoe: 8.3, success: 97.5 },
  { week: "Week 2", qoe: 8.5, success: 98.1 },
  { week: "Week 3", qoe: 8.7, success: 98.3 },
  { week: "Week 4", qoe: 8.9, success: 98.5 },
]

export default function MetricsChart() {
  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <h2 className="text-xl mb-6 font-medium">Performance Metrics Over Time</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4f46e5" />
          <XAxis dataKey="week" stroke="#a5b4fc" />
          <YAxis stroke="#a5b4fc" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e1b4b",
              border: "1px solid #4f46e5",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#e0e7ff" }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="qoe"
            stroke="#22c55e"
            name="Avg QoE Score"
            strokeWidth={2}
            dot={{ fill: "#22c55e", r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="success"
            stroke="#3b82f6"
            name="Success Rate %"
            strokeWidth={2}
            dot={{ fill: "#3b82f6", r: 4 }}
            yAxisId="right"
          />
          <YAxis yAxisId="right" orientation="right" stroke="#a5b4fc" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
