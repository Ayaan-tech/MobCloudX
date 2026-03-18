"use client"

import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

const data = [
  { duration: 120, qoe: 8.2, size: 450 },
  { duration: 145, qoe: 8.7, size: 520 },
  { duration: 98, qoe: 7.8, size: 380 },
  { duration: 167, qoe: 9.1, size: 610 },
  { duration: 134, qoe: 8.5, size: 490 },
  { duration: 156, qoe: 8.9, size: 560 },
  { duration: 189, qoe: 9.3, size: 680 },
  { duration: 123, qoe: 8.1, size: 440 },
  { duration: 145, qoe: 8.6, size: 530 },
  { duration: 178, qoe: 9.2, size: 640 },
]

export default function PerformanceCluster() {
  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <h2 className="text-xl mb-6 font-medium">Job Performance Clusters</h2>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#4f46e5" />
          <XAxis dataKey="duration" name="Duration (seconds)" stroke="#a5b4fc" />
          <YAxis dataKey="qoe" name="QoE Score" stroke="#a5b4fc" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e1b4b",
              border: "1px solid #4f46e5",
              borderRadius: "8px",
            }}
            labelStyle={{ color: "#e0e7ff" }}
            cursor={{ strokeDasharray: "3 3" }}
          />
          <Scatter name="Jobs" data={data} fill="#3b82f6">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.qoe > 8.5 ? "#22c55e" : "#ef4444"} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
