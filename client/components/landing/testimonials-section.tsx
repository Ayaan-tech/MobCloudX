import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "VP of Engineering, StreamCo",
    initials: "SM",
    gradient: "from-blue-500 to-purple-500",
    text: "mobCloudX has transformed how we manage our video pipeline. The AI insights alone have helped us reduce failures by 40% and improve quality scores across the board.",
  },
  {
    name: "James Chen",
    role: "CTO, MediaTech Solutions",
    initials: "JC",
    gradient: "from-cyan-500 to-cyan-500",
    text: "The real-time analytics and correlation matrices give us unprecedented visibility into our transcoding operations. We can now predict and prevent issues before they impact users.",
  },
  {
    name: "Emily Rodriguez",
    role: "Head of Operations, VideoHub",
    initials: "ER",
    gradient: "from-orange-500 to-pink-500",
    text: "Best investment we've made for our video infrastructure. The QoE scoring and pipeline visualization features have become essential to our daily operations.",
  },
  {
    name: "Michael Kim",
    role: "Director of Quality, ContentStream",
    initials: "MK",
    gradient: "from-purple-500 to-indigo-500",
    text: "The automated defect detection has saved our team countless hours. We now catch quality issues before they reach production, and the recommended fixes are spot-on.",
  },
  {
    name: "Lisa Patel",
    role: "Senior Engineer, CloudVideo Pro",
    initials: "LP",
    gradient: "from-red-500 to-orange-500",
    text: "Outstanding platform with excellent support. The dashboard is intuitive, and the performance clustering feature helps us optimize our encoding profiles like never before.",
  },
]

export default function TestimonialsSection() {
  return (
    <section className="py-20 px-4 bg-indigo-900">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl tracking-tight mb-4 font-semibold">Trusted by Industry Leaders</h2>
          <p className="text-indigo-400 text-lg font-medium">See what our customers have to say about mobCloudX</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {testimonials.slice(0, 3).map((testimonial, index) => (
            <div key={index} className="bg-indigo-950 rounded-xl border border-indigo-800 p-8">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-indigo-300 mb-6 font-medium">{testimonial.text}</p>
              <div className="flex items-center">
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${testimonial.gradient} rounded-full flex items-center justify-center text-white mr-4 font-medium`}
                >
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-medium">{testimonial.name}</div>
                  <div className="text-sm text-indigo-400 font-medium">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {testimonials.slice(3).map((testimonial, index) => (
            <div key={index} className="bg-indigo-950 rounded-xl border border-indigo-800 p-8">
              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                ))}
              </div>
              <p className="text-indigo-300 mb-6 font-medium">{testimonial.text}</p>
              <div className="flex items-center">
                <div
                  className={`w-12 h-12 bg-gradient-to-br ${testimonial.gradient} rounded-full flex items-center justify-center text-white mr-4 font-medium`}
                >
                  {testimonial.initials}
                </div>
                <div>
                  <div className="font-medium">{testimonial.name}</div>
                  <div className="text-sm text-indigo-400 font-medium">{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
