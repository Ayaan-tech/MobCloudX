"use client"

import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface ChartData {
  range: string
  jobs: number
}

interface ApiResponse {
  success: boolean
  data: ChartData[]
  totalRecords: number
  validRecords: number
  invalidRecords: number
  timestamp: string
}

export default function QoEDistributionChart() {
  const [data, setData] = useState<ChartData[]>([
    { range: "0-2", jobs: 0 },
    { range: "2-4", jobs: 0 },
    { range: "4-6", jobs: 0 },
    { range: "6-8", jobs: 0 },
    { range: "8-10", jobs: 0 },
  ])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalRecords, setTotalRecords] = useState(0)
  const [validRecords, setValidRecords] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<string>("")

  const fetchQoEData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/qoe', {
        cache: 'no-store',
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch QoE data')
      }
      
      const result: ApiResponse = await response.json()
      
      if (result.success && result.data) {
        setData(result.data)
        setTotalRecords(result.totalRecords)
        setValidRecords(result.validRecords)
        setLastUpdated(new Date(result.timestamp).toLocaleTimeString())
      } else {
        throw new Error('Invalid data format')
      }
    } catch (err) {
      console.error('Error fetching QoE distribution:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQoEData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchQoEData, 30000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-medium">QoE Score Distribution</h2>
          {lastUpdated && (
            <p className="text-xs text-indigo-300 mt-1">
              Last updated: {lastUpdated}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {validRecords > 0 && (
            <div className="text-right">
              <span className="text-sm text-indigo-300 block">
                Total: {totalRecords}
              </span>
              <span className="text-xs text-indigo-400">
                Valid: {validRecords} | Invalid: {totalRecords - validRecords}
              </span>
            </div>
          )}
          <button
            onClick={fetchQoEData}
            disabled={loading}
            className="px-3 py-1 bg-indigo-700 hover:bg-indigo-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh data"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Refreshing...
              </span>
            ) : (
              'Refresh'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm flex items-start gap-2">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {loading && data.every(d => d.jobs === 0) ? (
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-center">
            <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-indigo-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <div className="text-indigo-300">Loading QoE data...</div>
          </div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#4f46e5" />
            <XAxis 
              dataKey="range" 
              stroke="#a5b4fc"
              label={{ value: 'QoE Score Range (0-10 scale)', position: 'insideBottom', offset: -5, fill: '#a5b4fc' }}
            />
            <YAxis 
              stroke="#a5b4fc"
              label={{ value: 'Number of Jobs', angle: -90, position: 'insideLeft', fill: '#a5b4fc' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e1b4b",
                border: "1px solid #4f46e5",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#e0e7ff" }}
              cursor={{ fill: 'rgba(79, 70, 229, 0.1)' }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
            />
            <Bar 
              dataKey="jobs" 
              fill="#3b82f6" 
              name="Number of Jobs"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
      
      {!loading && validRecords === 0 && !error && (
        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded text-yellow-200 text-sm text-center">
          No valid QoE data found in the database.
        </div>
      )}
    </div>
  )
}