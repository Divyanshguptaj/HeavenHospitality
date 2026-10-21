import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import api from '../../lib/api'

function SpecialOfferBanner() {
  const [offer, setOffer] = useState(null)

  useEffect(() => {
    let isActive = true

    api.get('/offers/active')
      .then((response) => {
        if (isActive) setOffer(response.data?.data || null)
      })
      .catch(() => {})

    return () => { isActive = false }
  }, [])

  if (!offer) return null

  return (
    <div className="border-b border-[#e5d5c3] bg-[#fdf3e7]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2 px-4 py-2.5 text-center text-sm text-[#7a4a1f] sm:px-6 lg:px-8">
        <Sparkles size={15} className="shrink-0" />
        <span className="font-semibold">{offer.title}:</span>
        <span>{offer.amount}</span>
        {offer.description && <span className="hidden text-[#9a6b3f] sm:inline">— {offer.description}</span>}
      </div>
    </div>
  )
}

export default SpecialOfferBanner
