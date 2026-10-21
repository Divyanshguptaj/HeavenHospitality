import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import api from '../../lib/api'
import SectionHeading from '../common/SectionHeading'

function Reviews() {
  const [reviews, setReviews] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isActive = true

    api.get('/reviews')
      .then((response) => {
        const data = response.data?.data || []
        if (isActive) setReviews(data)
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  return (
    <section id="reviews" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Reviews"
        title="A space for verified guest feedback."
        description="Verified guest feedback, managed from the Admin Panel."
        align="center"
      />

      {!isLoading && reviews.length === 0 && (
        <p className="mt-10 rounded-[2rem] border border-[#efe4d8] bg-white p-8 text-center text-slate-600">
          No reviews yet. Check back soon.
        </p>
      )}

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {reviews.map((review) => (
          <div key={review._id || review.name} className="rounded-[2rem] border border-[#efe4d8] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-1 text-[#c98a4b]">
              {Array.from({ length: review.rating }).map((_, index) => (
                <Star key={`${review._id || review.name}-${index}`} size={16} fill="currentColor" />
              ))}
            </div>
            <p className="mt-5 text-slate-700">“{review.review}”</p>
            <p className="mt-6 text-sm font-medium text-slate-900">{review.name}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default Reviews
