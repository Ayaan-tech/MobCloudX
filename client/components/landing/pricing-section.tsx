import { Check } from "lucide-react"

const plans = [
  {
    name: "Starter",
    price: 49,
    description: "Perfect for small teams",
    features: ["Up to 10K jobs/month", "Basic analytics", "Email support"],
    highlighted: false,
  },
  {
    name: "Professional",
    price: 149,
    description: "For growing businesses",
    features: ["Up to 100K jobs/month", "Advanced analytics", "AI insights included", "Priority support"],
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: null,
    description: "For large organizations",
    features: ["Unlimited jobs", "Custom integrations", "Dedicated account manager", "24/7 phone support"],
    highlighted: false,
  },
]

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 px-4 bg-indigo-950">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl tracking-tight mb-4 font-semibold">Simple Pricing</h2>
          <p className="text-indigo-400 text-lg font-medium">Choose the plan that fits your needs</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`p-8 rounded-xl border transition ${
                plan.highlighted
                  ? "bg-gradient-to-br from-blue-500/10 to-purple-500/10 border-2 border-blue-500/50 relative"
                  : "bg-indigo-900 border-indigo-800"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-blue-500 text-white text-xs rounded-full font-medium">
                  Most Popular
                </div>
              )}
              <div className="text-sm text-indigo-400 mb-2 font-medium">{plan.name}</div>
              <div className="text-4xl mb-4 font-semibold">
                {plan.price ? `$${plan.price}` : "Custom"}
                {plan.price && <span className="text-lg text-indigo-400 font-medium">/month</span>}
              </div>
              <p className="text-indigo-400 mb-6 font-medium">{plan.description}</p>
              <button
                className={`w-full py-3 rounded-lg transition mb-6 font-medium ${
                  plan.highlighted ? "bg-blue-500 hover:bg-blue-600" : "bg-indigo-800 hover:bg-indigo-700"
                }`}
              >
                {plan.name === "Enterprise" ? "Contact Sales" : "Get Started"}
              </button>
              <ul className="space-y-3 text-sm">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <Check className="w-4 h-4 text-green-400 mr-3 mt-0.5 flex-shrink-0" />
                    <span className="text-indigo-300 font-medium">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
