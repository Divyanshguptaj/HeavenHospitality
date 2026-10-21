import { ExternalLink, Mail, MapPin, Navigation, Phone } from 'lucide-react'
import { useSiteData } from '../../context/siteDataContext'
import SectionHeading from '../common/SectionHeading'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

function Location() {
  const { siteData } = useSiteData()

  const hasAddress = Boolean(siteData.address?.trim())
  const encodedAddress = hasAddress ? encodeURIComponent(siteData.address) : ''

  const openInMapsUrl = hasAddress
    ? (siteData.googleMapsUrl && siteData.googleMapsUrl !== '#'
      ? siteData.googleMapsUrl
      : `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`)
    : null
  const directionsUrl = hasAddress ? `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}` : null
  const embedUrl = hasAddress && GOOGLE_MAPS_API_KEY
    ? `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodedAddress}`
    : null

  const hasPhone = Boolean(siteData.phone?.trim())
  const hasEmail = Boolean(siteData.email?.trim())

  return (
    <section id="location" className="bg-[#f8f5f1] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Location"
          title="Easy to find and easy to reach."
          description="Find The Heaven Hospitality on the map below, or get directions straight to our door."
        />

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-white p-3 shadow-sm">
            {embedUrl ? (
              <iframe
                allowFullScreen
                className="h-[350px] w-full rounded-[1.5rem] border-0 sm:h-[400px]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={embedUrl}
                title={`Map showing the ${siteData.brand} location`}
              />
            ) : (
              <div className="flex h-[350px] flex-col items-center justify-center gap-3 rounded-[1.5rem] bg-[linear-gradient(135deg,#f5efe7,#efefee,#e7e2db)] p-6 text-center sm:h-[400px]">
                <MapPin className="text-[#8d5c2c]" size={28} />
                <p className="max-w-xs text-sm text-slate-600">
                  {hasAddress
                    ? 'The interactive map preview will appear here once a Google Maps API key is configured.'
                    : 'The map will appear once the property address is confirmed.'}
                </p>
                {hasAddress && (
                  <a
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#8d5c2c] underline underline-offset-4"
                    href={openInMapsUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View on Google Maps <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-[#efe4d8] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-1 shrink-0 text-[#8d5c2c]" size={18} />
                <p>{hasAddress ? siteData.address : 'Address to be confirmed.'}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-[#efe4d8] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Navigation className="mt-1 shrink-0 text-[#8d5c2c]" size={18} />
                {hasAddress ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    <a className="text-slate-700 underline decoration-[#c98a4b] underline-offset-4" href={openInMapsUrl} rel="noreferrer" target="_blank">
                      Open in Google Maps
                    </a>
                    <a className="text-slate-700 underline decoration-[#c98a4b] underline-offset-4" href={directionsUrl} rel="noreferrer" target="_blank">
                      Get Directions
                    </a>
                  </div>
                ) : (
                  <p>Map directions will be available once the address is confirmed.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#efe4d8] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Phone className="mt-1 shrink-0 text-[#8d5c2c]" size={18} />
                {hasPhone ? (
                  <a className="text-slate-700 hover:text-[#8d5c2c]" href={`tel:${siteData.phone}`}>{siteData.phone}</a>
                ) : (
                  <p>Phone number coming soon.</p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[#efe4d8] bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <Mail className="mt-1 shrink-0 text-[#8d5c2c]" size={18} />
                {hasEmail ? (
                  <a className="text-slate-700 hover:text-[#8d5c2c]" href={`mailto:${siteData.email}`}>{siteData.email}</a>
                ) : (
                  <p>Email coming soon.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Location
