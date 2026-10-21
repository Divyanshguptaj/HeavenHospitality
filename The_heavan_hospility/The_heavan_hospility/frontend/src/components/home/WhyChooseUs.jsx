import { ShieldCheck, Sparkles, MapPin, UtensilsCrossed, Wifi, House } from 'lucide-react'
import SectionHeading from '../common/SectionHeading'

const features = [
  { title: 'Comfortable Living', icon: House, text: 'Thoughtfully planned spaces for a relaxed daily routine.' },
  { title: 'Clean Environment', icon: Sparkles, text: 'Well-kept living spaces with a focus on cleanliness.' },
  { title: 'Convenient Location', icon: MapPin, text: 'Easy access and a practical location for everyday movement.' },
  { title: 'Food', icon: UtensilsCrossed, text: 'Meal support and dining convenience can be customized as needed.' },
  { title: 'Security', icon: ShieldCheck, text: 'Safety-minded property management designed around peace of mind.' },
  { title: 'Modern Amenities', icon: Wifi, text: 'Updated essentials and living comforts to support daily living.' },
]

function WhyChooseUs() {
  return (
    <section className="bg-[#f7f2ec] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Why choose us"
          title="Everything you need for a smoother, calmer stay."
          description="A premium living experience shaped around comfort, essentials, and a dependable environment."
          align="center"
        />

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {features.map(({ title, text, icon: Icon }) => (
            <div key={title} className="rounded-3xl border border-[#eadcc8] bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
              <div className="mb-4 inline-flex rounded-2xl bg-[#f5e8dd] p-3 text-[#8d5c2c]">
                <Icon size={22} />
              </div>
              <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default WhyChooseUs
