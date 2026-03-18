"use client"

import { ArrowRight } from "lucide-react"
import SplineBackground from "./spline-background"

interface HeroSectionProps {
  onShowAuth: (type: "signin" | "signup") => void
}

export default function HeroSection({ onShowAuth }: HeroSectionProps) {
  return (
    <section className="relative pt-32 pr-4 pb-20 pl-4 min-h-screen overflow-hidden">
      <SplineBackground />

      <div className="relative z-10 text-center max-w-7xl mr-auto ml-auto">
        
        <h1 className="text-5xl md:text-7xl tracking-tight mb-6 font-semibold">
          Intelligent Video
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Transcoding Platform
          </span>
        </h1>
        <p className="text-xl text-indigo-400 max-w-2xl mr-auto mb-8 ml-auto font-medium">
          Monitor, analyze, and optimize your video transcoding pipeline with real-time analytics, QoE scoring, and
          AI-powered quality insights.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => onShowAuth("signup")}
            className="px-8 py-4 bg-indigo-100 hover:bg-white text-indigo-900 rounded-lg transition flex items-center justify-center font-medium"
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
          <button className="px-8 py-4 bg-indigo-800/50 hover:bg-indigo-800 backdrop-blur-sm text-indigo-100 rounded-lg transition border border-indigo-700 font-medium">
            Watch Demo
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-4xl mb-2 font-semibold">98.5%</div>
            <div className="text-sm text-indigo-400 font-medium">Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-2 font-semibold">50M+</div>
            <div className="text-sm text-indigo-400 font-medium">Jobs Processed</div>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-2 font-semibold">&lt;2s</div>
            <div className="text-sm text-indigo-400 font-medium">Avg Response</div>
          </div>
          <div className="text-center">
            <div className="text-4xl mb-2 font-semibold">24/7</div>
            <div className="text-sm text-indigo-400 font-medium">Monitoring</div>
          </div>
        </div>
      </div>
    </section>
  )
}
