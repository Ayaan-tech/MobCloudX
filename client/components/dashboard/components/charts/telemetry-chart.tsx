"use client"

import { useState, useEffect } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"


export default function TelemetryChart() {
  const [viewMode, setViewMode] = useState<'time' | 'day'>('time')
  const [dayInterval, setDayInterval] = useState(1)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)

  const dayOptions = [
    { value: 1, label: '1 Day' },
    { value: 2, label: '2 Days' },
    { value: 7, label: '7 Days' },
    { value: 10, label: '10 Days' },
    { value: 30, label: '30 Days' }
  ]

  useEffect(() => {
    fetchTelemetryData()
  }, [viewMode, dayInterval])

  const fetchTelemetryData = async () => {
    setLoading(true)
    try {
      
      const response = await fetch(`/api/telemetry?mode=${viewMode}&days=${dayInterval}`)
      const result = await response.json()
      
      setData(result.data)
    } catch (error) {
      console.error('Error fetching telemetry:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-medium">Real-time Telemetry</h2>
        
        <div className="flex items-center gap-4">
          {/* View Mode Toggle */}
          <div className="flex bg-indigo-950 rounded-lg p-1">
            <button
              onClick={() => setViewMode('time')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'time'
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-300 hover:text-white'
              }`}
            >
              Time Based
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'day'
                  ? 'bg-indigo-600 text-white'
                  : 'text-indigo-300 hover:text-white'
              }`}
            >
              Day Based
            </button>
          </div>

          {/* Day Interval Selector */}
          {viewMode === 'day' && (
            <select
              value={dayInterval}
              onChange={(e) => setDayInterval(Number(e.target.value))}
              className="bg-indigo-950 border border-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {dayOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-indigo-300">Loading telemetry data...</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#4f46e5" />
            <XAxis 
              dataKey="time" 
              stroke="#a5b4fc"
              tick={{ fontSize: 12 }}
            />
            <YAxis stroke="#a5b4fc" />
            <YAxis yAxisId="right" orientation="right" stroke="#a5b4fc" />
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
              dataKey="messages"
              stroke="#3b82f6"
              name="Messages Consumed (k)"
              strokeWidth={2}
              dot={viewMode === 'day'}
            />
            <Line
              type="monotone"
              dataKey="cpu"
              stroke="#a855f7"
              name="Avg CPU %"
              strokeWidth={2}
              dot={viewMode === 'day'}
              yAxisId="right"
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 text-xs text-indigo-300">
        {viewMode === 'time' ? 'Showing last 24 hours in 4-hour intervals' : `Showing last ${dayInterval} day${dayInterval > 1 ? 's' : ''}`}
      </div>
    </div>
  )
}