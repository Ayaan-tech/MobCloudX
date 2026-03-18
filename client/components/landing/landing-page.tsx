import Navigation from "./navigation"
import HeroSection from "./hero-section"
import FeaturesSection from "./features-section"
import TestimonialsSection from "./testimonials-section"
import PricingSection from "./pricing-section"
import CTASection from "./cta-section"

interface LandingPageProps {
  onShowAuth: (type: "signin" | "signup") => void
}

export default function LandingPage({ onShowAuth }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <Navigation onShowAuth={onShowAuth} />
      <HeroSection onShowAuth={onShowAuth} />
      <FeaturesSection />
      <TestimonialsSection />
      <PricingSection />
      <CTASection onShowAuth={onShowAuth} />
    </div>
  )
}
