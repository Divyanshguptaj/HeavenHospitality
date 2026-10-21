import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import api from '../../lib/api'
import SectionHeading from '../common/SectionHeading'

function Amenities() {
  const [amenities, setAmenities] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isActive = true

    api.get('/amenities')
      .then((response) => {
        const data = (response.data?.data || [])
          .filter((amenity) => amenity.isActive !== false)
          .map((amenity) => amenity.name)
        if (isActive) setAmenities(data)
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  return (
    <section id="amenities" className="bg-[#f8f5f1] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Amenities"
          title="Practical comforts that make everyday living easier."
          description="Amenities are separated into a central data source so they can be updated easily when the final property list is confirmed."
          align="center"
        />

        {!isLoading && amenities.length === 0 && (
          <p className="mt-12 rounded-3xl border border-[#eadcc8] bg-white p-8 text-center text-slate-600">
            Amenities will be listed here soon.
          </p>
        )}

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {amenities.map((amenity) => (
            <div key={amenity} className="flex items-center gap-3 rounded-2xl border border-[#eadcc8] bg-white p-4 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f5e8dd] text-[#8d5c2c]">
                <CheckCircle2 size={16} />
              </span>
              <span className="font-medium text-slate-700">{amenity}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Amenities
