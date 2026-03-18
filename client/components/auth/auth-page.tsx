  "use client"
  import CustomLoginPage from "./login-page"

  interface AuthPageProps{
    initialType: "signin" | "signup"
    onShowDashboard: () => void
    onShowLanding: () => void
  }


  export default function AuthPage({ initialType, onShowDashboard, onShowLanding }: AuthPageProps){
    return <CustomLoginPage initialType={initialType} onSuccess={onShowDashboard} onShowLanding={onShowLanding}/>
  }