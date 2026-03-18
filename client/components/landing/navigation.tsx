"use client"

import Image from "next/image"

interface NavigationProps {
  onShowAuth: (type: "signin" | "signup") => void
}

export default function Navigation({ onShowAuth }: NavigationProps) {
  return (
    <nav className="fixed top-3 z-50 w-full flex justify-center px-4">
      <div className="w-full max-w-4xl">
        <div className="h-16 flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-full px-6 shadow-lg">
          {/* Logo Section */}
          <div className="flex items-center gap-2">
            <Image src="/mobcloudx-logo.png" alt="mobCloudX" width={36} height={36} className="w-9 h-9" />
            <span className="text-base font-semibold tracking-tight text-white font-sans">mobCloudX</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
            <a href="#features" className="hover:text-white transition font-sans">
              Features
            </a>
            <a href="#how-to-use" className="hover:text-white transition font-sans">
              How to use
            </a>
            <a href="#pricing" className="hover:text-white transition font-sans">
              Pricing
            </a>
            <a href="#about" className="hover:text-white transition font-sans">
              About us
            </a>
          </nav>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => onShowAuth("signin")}
              className="px-4 py-1.5 text-sm rounded-md text-slate-300 hover:text-white transition font-sans"
            >
              Sign In
            </button>
            <button
              onClick={() => onShowAuth("signup")}
              className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-white/10 to-white/5 border border-white/15 rounded-full hover:from-white/15 hover:to-white/10 transition backdrop-blur-xl shadow-lg"
            >
              Get Started
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-white/5 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M4 12h16"></path>
              <path d="M4 18h16"></path>
              <path d="M4 6h16"></path>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
