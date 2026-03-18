"use client"

import { useState } from "react"
import LandingPage from "@/components/landing/landing-page"
import AuthPage from "@/components/auth/auth-page"
import DashboardPage from "@/components/dashboard/dashboard-page"

type PageType = "landing" | "auth" | "dashboard"

export default function Home() {
  const [currentPage, setCurrentPage] = useState<PageType>("landing")
  const [authType, setAuthType] = useState<"signin" | "signup">("signin")

  const handleShowAuth = (type: "signin" | "signup") => {
    setAuthType(type)
    setCurrentPage("auth")
  }

  const handleShowDashboard = () => {
    setCurrentPage("dashboard")
  }

  const handleShowLanding = () => {
    setCurrentPage("landing")
  }

  return (
    <>
      {currentPage === "landing" && <LandingPage onShowAuth={handleShowAuth} />}
      {currentPage === "auth" && (
        <AuthPage initialType={authType} onShowDashboard={handleShowDashboard} onShowLanding={handleShowLanding} />
      )}
      {currentPage === "dashboard" && <DashboardPage onLogout={handleShowLanding} />}
    </>
  )
}
