"use client"

import { WobbleCard } from "@/components/ui/wobble-card"
import Image from "next/image"

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 px-4 bg-indigo-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl tracking-tight mb-4 font-semibold text-white">Powerful Analytics Features</h2>
          <p className="text-indigo-400 text-lg font-medium">
            Everything you need to monitor and optimize video transcoding
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          {/* Card 1: AI-Powered Performance Hub */}
          <WobbleCard
            containerClassName="col-span-1 bg-gradient-to-br from-indigo-900 to-indigo-800 min-h-[400px] lg:min-h-[500px]"
            className=""
          >
            <div className="max-w-sm">
              <h3 className="text-left text-balance text-2xl md:text-3xl font-semibold tracking-tight text-white">
                AI-Powered Performance Hub
              </h3>
              <p className="mt-4 text-left text-base text-indigo-200">
                Real-time monitoring of system health, QoE scores, and video stream analysis with advanced analytics
                dashboard.
              </p>
            </div>
            <Image
              src="/mobcloudx-dashboard.png"
              alt="mobCloudX Performance Dashboard"
              width={500}
              height={500}
              className="absolute -right-8 lg:-right-12 -bottom-4 object-contain rounded-xl max-w-xs lg:max-w-sm"
            />
          </WobbleCard>

          {/* Card 2: Video Optimization Engine */}
          <WobbleCard
            containerClassName="col-span-1 bg-gradient-to-br from-blue-900 to-cyan-900 min-h-[400px] lg:min-h-[500px]"
            className=""
          >
            <div className="max-w-sm">
              <h3 className="text-left text-balance text-2xl md:text-3xl font-semibold tracking-tight text-white">
                Unlocking Perfect Video at Scale
              </h3>
              <p className="mt-4 text-left text-base text-blue-200">
                Advanced optimization engine that transforms raw video sources into perfectly encoded streams with 99%
                CPU efficiency.
              </p>
            </div>
            <Image
              src="/mobcloudx-optimizer.png"
              alt="mobCloudX Video Optimizer"
              width={500}
              height={500}
              className="absolute -right-8 lg:-right-12 -bottom-4 object-contain rounded-xl max-w-xs lg:max-w-sm"
            />
          </WobbleCard>
        </div>
      </div>
    </section>
  )
}
