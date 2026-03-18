import type React from "react"
import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ClerkProvider } from "@clerk/nextjs"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "mobCloudX - Video Transcoding Analytics",
  description: "AI-powered video transcoding analytics platform with real-time monitoring and QoE scoring",
  keywords: ["video", "transcoding", "analytics", "QoE", "monitoring"],
  authors: [{ name: "mobCloudX" }],
  openGraph: {
    title: "mobCloudX - Video Transcoding Analytics",
    description: "Monitor, analyze, and optimize your video transcoding pipeline",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
  <ClerkProvider>
    <html lang="en">
      <body className={`font-sans antialiased bg-slate-900 text-slate-100`}>
        {children}
        <Analytics />
      </body>
    </html>
  </ClerkProvider>
  )
}
