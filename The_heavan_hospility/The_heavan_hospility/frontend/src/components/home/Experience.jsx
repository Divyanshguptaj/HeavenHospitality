import { BedDouble, Sparkles, Users, Compass } from 'lucide-react'
import SectionHeading from '../common/SectionHeading'

const experienceItems = [
  { title: 'Comfort', text: 'Relaxed spaces designed for a productive and peaceful routine.', icon: BedDouble },
  { title: 'Community', text: 'A friendly environment that promotes belonging and balance.', icon: Users },
  { title: 'Cleanliness', text: 'Maintained spaces and regular upkeep for a calmer home feel.', icon: Sparkles },
  { title: 'Convenience', text: 'Thoughtful planning around location and everyday needs.', icon: Compass },
]

function Experience() {
  return (
    <section className="bg-[#f7f2ec] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Lifestyle"
          title="A balanced PG experience built around comfort and convenience."
          description="The environment is designed to feel calm, practical, and welcoming for everyday living."
          align="center"
        />

        <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {experienceItems.map(({ title, text, icon: Icon }) => (
            <div key={title} className="rounded-3xl border border-[#eadcc8] bg-white p-6 shadow-sm">
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

export default Experience
