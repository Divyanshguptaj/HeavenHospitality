import { useSiteData } from '../../context/siteDataContext'
import SectionHeading from '../common/SectionHeading'

function About() {
  const { siteData } = useSiteData()

  return (
    <section id="about" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          <div className="h-[420px] rounded-[1.5rem] bg-[linear-gradient(135deg,#f7efe5,#f2f2f1_45%,#efe7dc)]" />
        </div>

        <div>
          <SectionHeading
            eyebrow="About"
            title={siteData.about.heading}
            description={siteData.about.body}
          />

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {['Comfortable living spaces', 'Well-managed community', 'Secure environment', 'Convenient location'].map((item) => (
              <div key={item} className="rounded-2xl border border-[#efe4d8] bg-white p-4 text-sm text-slate-700 shadow-sm">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

export default About
