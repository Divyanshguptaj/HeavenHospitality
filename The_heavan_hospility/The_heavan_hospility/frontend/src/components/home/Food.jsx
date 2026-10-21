import { useEffect, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import api from '../../lib/api'
import SectionHeading from '../common/SectionHeading'

function Food() {
  const [foodItems, setFoodItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isActive = true

    api.get('/food')
      .then((response) => {
        const data = (response.data?.data || []).filter((item) => item.isActive !== false)
        if (isActive) setFoodItems(data)
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  const heroImage = foodItems.find((item) => item.imageUrl)?.imageUrl

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.06)]">
          {heroImage ? (
            <img alt="Dining highlight" className="h-[360px] w-full rounded-[1.5rem] object-cover" src={heroImage} />
          ) : (
            <div className="h-[360px] rounded-[1.5rem] bg-[linear-gradient(135deg,#f7efe5,#f1f1f1,#e8e4dd)]" />
          )}
        </div>

        <div>
          <SectionHeading
            eyebrow="Food & Dining"
            title="A practical dining experience shaped for everyday comfort."
            description="Food details are intentionally kept configurable so the final menu and dining setup can be updated later without changing the layout structure."
          />

          <div className="mt-8 space-y-4">
            {foodItems.map((item) => (
              <div key={item._id} className="flex items-start gap-3 rounded-2xl border border-[#efe4d8] bg-white p-4 shadow-sm">
                <span className="mt-1 inline-flex rounded-full bg-[#f5e8dd] p-2 text-[#8d5c2c]">
                  <UtensilsCrossed size={16} />
                </span>
                <div>
                  <p className="font-medium text-slate-800">{item.title}</p>
                  {item.description && <p className="mt-1 text-sm text-slate-600">{item.description}</p>}
                </div>
              </div>
            ))}
            {!isLoading && foodItems.length === 0 && (
              <p className="rounded-2xl border border-[#efe4d8] bg-white p-4 text-slate-600">
                Food and dining details will be added here soon.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default Food
