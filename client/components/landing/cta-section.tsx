"use client"

interface CTASectionProps {
  onShowAuth: (type: "signin" | "signup") => void
}

export default function CTASection({ onShowAuth }: CTASectionProps) {
  return (
    <section className="py-20 px-4 bg-indigo-900">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl tracking-tight mb-4 font-semibold">Ready to optimize your pipeline?</h2>
        <p className="text-indigo-400 text-lg mb-8 font-medium">
          Start monitoring and improving your video transcoding quality today
        </p>
        <button
          onClick={() => onShowAuth("signup")}
          className="px-8 py-4 bg-indigo-100 hover:bg-white text-indigo-900 rounded-lg transition font-medium"
        >
          Start Free Trial
        </button>
      </div>
    </section>
  )
}
