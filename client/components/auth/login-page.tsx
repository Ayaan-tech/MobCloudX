"use client"

import type React from "react"
import { useState } from "react"
import { Lock, Mail, Eye, EyeOff, Check } from "lucide-react"
import { useSignIn, useSignUp } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

interface CustomLoginPageProps {
  onSuccess: () => void
  onShowLanding: () => void
  initialType?: "signin" | "signup"
}

export default function CustomLoginPage({ onSuccess, onShowLanding, initialType = "signin" }: CustomLoginPageProps) {
  const [authType, setAuthType] = useState<"signin" | "signup">(initialType)
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const { signIn, isLoaded: signInLoaded } = useSignIn()
  const { signUp, isLoaded: signUpLoaded } = useSignUp()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (authType === "signin") {
        if (!signInLoaded) return

        const result = await signIn.create({
          identifier: email,
          password,
        })

        if (result.status === "complete") {
          console.log(" Sign in successful")
          onSuccess()
          router.push("/dashboard")
        }
      } else {
        if (!signUpLoaded) return

        const result = await signUp.create({
          emailAddress: email,
          password,
        })

        if (result.status === "complete") {
          console.log("Sign up successful")
          onSuccess()
          router.push("/dashboard")
        }
      }
    } catch (err: any) {
      console.log("[v0] Auth error:", err)
      setError(err.errors?.[0]?.message || "Authentication failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthLogin = async (strategy: any) => {
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: "/dashboard",
        redirectUrlComplete: "/dashboard",
      })
    } catch (err: any) {
      console.error("OAuth login error:", err)
    }
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(139,92,246,0.1),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(59,130,246,0.1),transparent_50%)]"></div>
      </div>

      {/* Main Container */}
      <div className="relative w-full max-w-5xl animate-in fade-in slide-in-from-bottom-8 duration-1000">
        {/* Glass Card */}
        <div className="relative backdrop-blur-xl bg-white/10 border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          {/* Specular Highlight */}
          <div className="absolute inset-0 rounded-3xl bg-linear-to-br from-white/20 via-transparent to-transparent pointer-events-none"></div>

          {/* Split Layout */}
          <div className="flex flex-col lg:flex-row min-h-[600px]">
            {/* Left Side - Login Form */}
            <div className="flex-1 p-8 space-y-6">
              {/* Header */}
              <div className="text-center space-y-2 animate-in fade-in slide-in-from-top-4 duration-700 delay-300">
                <div className="w-16 h-16 bg-linear-to-br from-slate-900 to-slate-700 rounded-2xl mx-auto shadow-lg flex items-center justify-center">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-4xl font-light text-white tracking-tight uppercase">
                  {authType === "signin" ? "Welcome back" : "Join us"}
                </h1>
                <p className="text-white/70 text-sm">
                  {authType === "signin" ? "Sign in to your account" : "Create your account to get started"}
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-200 text-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              <form
                onSubmit={handleSubmit}
                className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-500"
              >
                {/* Email Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90 block">Email address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="w-5 h-5 text-white/50" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-300"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/90 block">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="w-5 h-5 text-white/50" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-12 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-300"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/50 hover:text-white/80 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password */}
                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center space-x-2 text-white/80 cursor-pointer">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="sr-only"
                      />
                      <div
                        className={`w-4 h-4 border rounded flex items-center justify-center transition-all ${rememberMe ? "bg-blue-500 border-blue-500" : "bg-white/20 border-white/30"}`}
                      >
                        {rememberMe && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                    <span>Remember me</span>
                  </label>
                  <a href="#" className="text-blue-400 hover:text-blue-300 transition-colors">
                    Forgot password?
                  </a>
                </div>

                {/* Login Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full hover:shadow-xl transform hover:scale-[1.02] transition-all duration-300 flex font-medium text-white bg-linear-to-br from-slate-900 to-slate-700 rounded-xl py-3 px-4 shadow-lg space-x-2 items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{loading ? "Signing in..." : authType === "signin" ? "Sign in" : "Create account"}</span>
                  {!loading && <span>→</span>}
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center animate-in fade-in duration-700 delay-700">
                <div className="flex-1 border-t border-white/20"></div>
                <span className="px-3 text-white/60 text-sm">or</span>
                <div className="flex-1 border-t border-white/20"></div>
              </div>

              {/* Social Login */}
              <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-900">
                <button className="w-full py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300 flex items-center justify-center space-x-2">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"></path>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"></path>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"></path>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"></path>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <button className="w-full py-3 px-4 bg-white/10 border border-white/20 rounded-xl text-white font-medium hover:bg-white/20 transition-all duration-300 flex items-center justify-center space-x-2"
                onClick={() => handleOAuthLogin("oauth_github")}
                disabled={loading}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4M9 18c-4.51 2-5-2-7-2"></path>
                  </svg>
                  <span>Continue with GitHub</span>
                </button>
              </div>

              {/* Auth Type Toggle */}
              <div className="text-center text-sm text-white/70 animate-in fade-in duration-700 delay-1100">
                {authType === "signin" ? "Don't have an account? " : "Already have an account? "}
                <button
                  onClick={() => setAuthType(authType === "signin" ? "signup" : "signin")}
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  {authType === "signin" ? "Sign up" : "Sign in"}
                </button>
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="hidden lg:block w-px bg-linear-to-b from-transparent via-white/20 to-transparent"></div>

            {/* Right Side - Welcome Content */}
            <div className="flex-1 p-8 flex flex-col justify-center space-y-6 animate-in fade-in slide-in-from-right-8 duration-1000 delay-300 bg-neutral-950/10">
              {/* Welcome Message */}
              <div className="space-y-4">
                <div className="w-20 h-20 bg-linear-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center backdrop-blur-sm border border-white/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-200"
                  >
                    <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"></path>
                    <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"></path>
                  </svg>
                </div>
                <h2 className="text-4xl font-light text-white tracking-tight">Join thousands of users</h2>
                <p className="text-white/70 text-lg leading-relaxed">
                  Experience the next generation of productivity tools designed to streamline your workflow and boost
                  your team's performance.
                </p>
              </div>

              {/* Features List */}
              <div className="space-y-4">
                {[
                  { title: "Advanced Analytics", desc: "Get detailed insights into your performance metrics" },
                  { title: "Team Collaboration", desc: "Work seamlessly with your team in real-time" },
                  { title: "Enterprise Security", desc: "Bank-level security to protect your sensitive data" },
                ].map((feature, idx) => (
                  <div
                    key={idx}
                    className="flex items-start space-x-3 animate-in fade-in slide-in-from-right-4 duration-700"
                    style={{ animationDelay: `${500 + idx * 200}ms` }}
                  >
                    <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium">{feature.title}</h3>
                      <p className="text-white/60 text-sm">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Testimonial */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-700 delay-1100">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-400 to-purple-400"></div>
                  <div>
                    <h4 className="text-white font-medium text-sm">Sarah Chen</h4>
                    <p className="text-white/60 text-xs">Product Manager at TechFlow</p>
                  </div>
                </div>
                <p className="text-sm font-light text-white/80">
                  "This platform has completely transformed how our team collaborates. The intuitive interface and
                  powerful features make it indispensable for our daily operations."
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Glow Effect */}
        <div className="absolute inset-0 -z-10 bg-linear-to-br from-blue-600/20 to-purple-600/20 blur-3xl"></div>
      </div>
    </div>
  )
}
