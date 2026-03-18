"use client"

import type React from "react"

import { useState } from "react"

interface SignInFormProps {
  onSuccess: () => void
}

export default function SignInForm({ onSuccess }: SignInFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate login
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Email</label>
        <input
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Password</label>
        <input
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center">
          <input type="checkbox" className="mr-2 rounded bg-indigo-800 border-indigo-700" />
          <span className="text-indigo-400 font-medium">Remember me</span>
        </label>
        <a href="#" className="text-blue-400 hover:text-blue-300 font-medium">
          Forgot password?
        </a>
      </div>
      <button type="submit" className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-lg transition font-medium">
        Sign In
      </button>
    </form>
  )
}
