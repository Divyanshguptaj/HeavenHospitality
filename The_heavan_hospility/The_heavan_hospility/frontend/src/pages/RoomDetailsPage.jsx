import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../lib/api'
import { normalizeRoom } from '../data/roomData'
import Button from '../components/common/Button'

function RoomDetailsPage() {
  const { id } = useParams()
  const [room, setRoom] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isActive = true

    api.get(`/rooms/${id}`)
      .then((response) => {
        const data = response.data?.data
        if (isActive && data) setRoom(normalizeRoom(data))
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [id])

  return (
    <main className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
      <Link to="/" className="mb-8 inline-block text-sm font-medium text-[#8d5c2c]">
        ← Back to Home
      </Link>

      {isLoading && !room && (
        <div className="rounded-3xl border border-[#efe4d8] bg-white p-8 shadow-sm">
          <p className="text-slate-600">Loading room details…</p>
        </div>
      )}

      {!isLoading && !room && (
        <div className="rounded-3xl border border-[#efe4d8] bg-white p-8 shadow-sm">
          <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Room Details</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Room not found</h1>
          <p className="mt-4 text-slate-600">
            This room may have been removed or is no longer available. Explore the other room options from the homepage.
          </p>
        </div>
      )}

      {room && (
        <div className="overflow-hidden rounded-3xl border border-[#efe4d8] bg-white shadow-sm">
          {room.image ? (
            <img alt={room.name} className="h-80 w-full object-cover" src={room.image} />
          ) : (
            <div className="h-80 bg-[linear-gradient(135deg,#f9efe4,#f2f2f1,#e8e1d8)]" />
          )}

          <div className="p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Room Details</p>
              <span className="rounded-full bg-[#f5e8dd] px-3 py-1 text-xs font-medium text-[#8d5c2c]">
                {room.availability}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-semibold text-slate-900">{room.name}</h1>
            <p className="mt-4 text-slate-600">{room.description}</p>

            {room.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {room.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-[#efe4d8] pt-6">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Starting from</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{room.price}</p>
              </div>
              <a href="/#enquiry">
                <Button variant="primary">Enquire Now</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

export default RoomDetailsPage
