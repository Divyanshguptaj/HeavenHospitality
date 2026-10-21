import About from '../components/home/About'
import Amenities from '../components/home/Amenities'
import Enquiry from '../components/home/Enquiry'
import Experience from '../components/home/Experience'
import FAQ from '../components/home/FAQ'
import Food from '../components/home/Food'
import Gallery from '../components/home/Gallery'
import Location from '../components/home/Location'
import Reviews from '../components/home/Reviews'
import Rooms from '../components/home/Rooms'
import SpecialOfferBanner from '../components/home/SpecialOfferBanner'
import WhyChooseUs from '../components/home/WhyChooseUs'
import Footer from '../components/layout/Footer'
import Navbar from '../components/layout/Navbar'
import WhatsAppButton from '../components/layout/WhatsAppButton'
import SiteDataProvider from '../context/SiteDataProvider'
import { useSiteData } from '../context/siteDataContext'

function HomeContent() {
  const { siteData } = useSiteData()

  return (
    <>
      <Navbar />
      <SpecialOfferBanner />
      <main id="home" className="min-h-screen bg-[#fffdfb] text-slate-800">
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-12 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:pt-10">
            <div>
              <span className="inline-flex items-center rounded-full border border-[#e5d5c3] bg-[#f9f3ee] px-3 py-1 text-sm font-medium text-[#8d5c2c]">
                {siteData.hero.eyebrow}
              </span>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                {siteData.hero.title}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-600">
                {siteData.hero.description}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <a href={siteData.hero.primaryCta.href} className="rounded-full bg-[#c98a4b] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#b77c3f]">
                  {siteData.hero.primaryCta.label}
                </a>
                <a href={siteData.hero.secondaryCta.href} className="rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-800 transition hover:border-[#c98a4b] hover:text-[#8d5c2c]">
                  {siteData.hero.secondaryCta.label}
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-white p-3 shadow-[0_20px_60px_rgba(31,41,55,0.08)]">
                <div className="h-[520px] rounded-[1.5rem] bg-[radial-gradient(circle_at_top,_#f6e5d4,_#f7f2ec_48%,_#efe4d7_100%)] p-6">
                  <div className="flex h-full items-end justify-between rounded-[1.3rem] border border-white/60 bg-[linear-gradient(135deg,rgba(255,255,255,0.45),rgba(255,255,255,0.15))] p-6 backdrop-blur-sm">
                    <div>
                      <p className="text-sm uppercase tracking-[0.25em] text-slate-500">{siteData.brand}</p>
                      <h2 className="mt-3 text-2xl font-semibold text-slate-900">Premium Living</h2>
                    </div>
                    <div className="rounded-full bg-[#fffaf4] px-4 py-2 text-sm font-medium text-[#8d5c2c] shadow-sm">
                      Price on Request
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { label: 'Comfort-first Living', value: 'Calm' },
              { label: 'Secure & Managed', value: 'Peace of Mind' },
              { label: 'Flexible Stay Plans', value: 'Easy' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-[#eee1d2] bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#8d5c2c]">{item.value}</p>
                <h3 className="mt-3 text-lg font-semibold text-slate-900">{item.label}</h3>
                <p className="mt-2 text-sm text-slate-600">Premium, calm, and thoughtfully managed spaces designed for everyday comfort.</p>
              </div>
            ))}
          </div>
        </section>

        <About />
        <WhyChooseUs />
        <Rooms />
        <Amenities />
        <Gallery />
        <Food />
        <Experience />
        <Reviews />
        <Location />
        <FAQ />
        <Enquiry />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  )
}

function Home() {
  return (
    <SiteDataProvider>
      <HomeContent />
    </SiteDataProvider>
  )
}

export default Home
