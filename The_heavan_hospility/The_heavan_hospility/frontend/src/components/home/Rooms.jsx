import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../lib/api'
import { normalizeRoom } from '../../data/roomData'
import Button from '../common/Button'
import SectionHeading from '../common/SectionHeading'

function Rooms() {
  const [rooms, setRooms] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isActive = true

    api.get('/rooms')
      .then((response) => {
        const data = (response.data?.data || []).filter((room) => room.isActive !== false)
        if (isActive) setRooms(data.map(normalizeRoom))
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  return (
    <section id="rooms" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Rooms"
        title="Thoughtful room options for every daily rhythm."
        description="Room categories are kept configurable so pricing and availability can be updated as real property details are finalized."
      />

      {!isLoading && rooms.length === 0 && (
        <p className="mt-10 rounded-3xl border border-[#efe4d8] bg-white p-8 text-center text-slate-600">
          Room options will be published here soon.
        </p>
      )}

      <div className="mt-10 grid gap-7 lg:grid-cols-2">
        {rooms.map((room) => (
          <article key={room.id} className="overflow-hidden rounded-[2rem] border border-[#efe4d8] bg-white shadow-sm">
            {room.image ? (
              <img alt={room.name} className="h-64 w-full object-cover" src={room.image} />
            ) : (
              <div className="h-64 bg-[linear-gradient(135deg,#f9efe4,#f2f2f1,#e8e1d8)]" />
            )}
            <div className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-semibold text-slate-900">{room.name}</h3>
                <span className="rounded-full bg-[#f5e8dd] px-3 py-1 text-xs font-medium text-[#8d5c2c]">
                  {room.availability}
                </span>
              </div>

              <p className="mt-4 text-sm text-slate-600">{room.description}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                {room.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Starting from</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{room.price}</p>
                </div>

                <div className="flex gap-3">
                  <a href="#enquiry">
                    <Button variant="secondary" className="text-xs">Enquire</Button>
                  </a>
                  <Link to={`/rooms/${room.id}`} className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-5 py-3 text-xs font-medium text-slate-800 transition hover:border-[#c98a4b] hover:text-[#8d5c2c]">
                    View Details
                  </Link>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export default Rooms
