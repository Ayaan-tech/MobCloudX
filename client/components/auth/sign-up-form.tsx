"use client"

import type React from "react"

import { useState } from "react"

interface SignUpFormProps {
  onSuccess: () => void
}

export default function SignUpForm({ onSuccess }: SignUpFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Simulate signup
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Full Name</label>
        <input
          type="text"
          name="name"
          placeholder="John Doe"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Email</label>
        <input
          type="email"
          name="email"
          placeholder="you@company.com"
          value={formData.email}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Password</label>
        <input
          type="password"
          name="password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm text-indigo-300 mb-2 font-medium">Confirm Password</label>
        <input
          type="password"
          name="confirmPassword"
          placeholder="••••••••"
          value={formData.confirmPassword}
          onChange={handleChange}
          className="w-full px-4 py-3 bg-indigo-800 border border-indigo-700 rounded-lg text-indigo-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button type="submit" className="w-full py-3 bg-blue-500 hover:bg-blue-600 rounded-lg transition font-medium">
        Create Account
      </button>
    </form>
  )
}
