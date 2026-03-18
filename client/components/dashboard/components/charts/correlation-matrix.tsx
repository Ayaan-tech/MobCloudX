"use client"

// Simulated correlation data
const data = [
  { x: 1, y: 1, value: 100 },
  { x: 2, y: 1, value: 85 },
  { x: 3, y: 1, value: -62 },
  { x: 4, y: 1, value: 73 },
  { x: 5, y: 1, value: -45 },
  { x: 1, y: 2, value: 85 },
  { x: 2, y: 2, value: 100 },
  { x: 3, y: 2, value: -58 },
  { x: 4, y: 2, value: 68 },
  { x: 5, y: 2, value: -52 },
]

export default function CorrelationMatrix() {
  return (
    <div className="bg-indigo-900 rounded-xl border border-indigo-800 p-6">
      <h2 className="text-xl mb-6 font-medium">QoE Factor Correlation Matrix</h2>
      <div className="h-96 bg-indigo-800/50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <p className="text-indigo-400 font-medium mb-2">Correlation Heatmap</p>
          <p className="text-sm text-indigo-500">Bitrate, Resolution, Encode Time, File Size, CPU Usage</p>
        </div>
      </div>
    </div>
  )
}
