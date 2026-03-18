"use client"

import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import DashboardPage from "@/components/dashboard/dashboard-page"
import { Loader } from "lucide-react"

export default function Dashboard() {

  return <DashboardPage onLogout={() => router.push("/")} />
}
