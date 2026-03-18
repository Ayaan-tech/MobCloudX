"use client"

import { Suspense } from "react"

// Using dynamic import with proper client-side rendering
const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 animate-pulse" />
  ),
})

import dynamic from "next/dynamic"

export default function SplineBackground() {
  return (
    <Suspense fallback={<div className="w-full h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900" />}>
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <Spline scene="https://prod.spline.design/LXCT4rETqDWgjM-w/scene.splinecode" />
      </div>
    </Suspense>
  )
}
