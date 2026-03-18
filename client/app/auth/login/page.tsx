"use client"

import CustomLoginPage from "@/components/auth/login-page"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()

  const handleSuccess = () => {
    router.push("/dashboard")
  }

  const handleShowLanding = () => {
    router.push("/")
  }

  return <CustomLoginPage onSuccess={handleSuccess} onShowLanding={handleShowLanding} initialType="signin" />
}
