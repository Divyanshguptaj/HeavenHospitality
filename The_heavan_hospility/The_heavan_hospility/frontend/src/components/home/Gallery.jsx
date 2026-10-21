import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import api from '../../lib/api'
import SectionHeading from '../common/SectionHeading'

function Gallery() {
  const [galleryItems, setGalleryItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('All')
  const [selectedIndex, setSelectedIndex] = useState(null)

  useEffect(() => {
    let isActive = true

    api.get('/gallery')
      .then((response) => {
        const data = (response.data?.data || [])
          .filter((item) => item.isActive !== false)
          .map((item) => ({
            id: item._id,
            category: item.category || 'General',
            label: item.title || item.category || 'Gallery image',
            imageUrl: item.imageUrl,
          }))
        if (isActive) setGalleryItems(data)
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  const categories = useMemo(() => {
    if (galleryItems.length === 0) return []
    return ['All', ...new Set(galleryItems.map((item) => item.category))]
  }, [galleryItems])

  const filteredItems =
    activeFilter === 'All'
      ? galleryItems
      : galleryItems.filter((item) => item.category === activeFilter)

  const selectedItem = selectedIndex !== null ? filteredItems[selectedIndex] : null

  const openLightbox = (index) => setSelectedIndex(index)
  const closeLightbox = () => setSelectedIndex(null)
  const prevItem = () => {
    if (selectedIndex === null) return
    setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length)
  }
  const nextItem = () => {
    if (selectedIndex === null) return
    setSelectedIndex((prev) => (prev + 1) % filteredItems.length)
  }

  return (
    <section id="gallery" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Gallery"
        title="A closer look at the living experience."
        description="Gallery filters and layout are prepared to accept real property photos when they are available."
        align="center"
      />

      {categories.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => setActiveFilter(category)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeFilter === category
                  ? 'bg-[#c98a4b] text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-[#c98a4b] hover:text-[#8d5c2c]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      )}

      {!isLoading && galleryItems.length === 0 && (
        <p className="mt-10 rounded-3xl border border-[#efe4d8] bg-white p-8 text-center text-slate-600">
          Gallery photos will be added here soon.
        </p>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredItems.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openLightbox(index)}
            className="group overflow-hidden rounded-[1.75rem] border border-[#efe4d8] bg-white text-left shadow-sm transition hover:-translate-y-1 hover:shadow-md"
          >
            <img alt={item.label} className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]" loading="lazy" src={item.imageUrl} />
            <div className="flex items-center justify-between p-4">
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
              <span className="text-xs uppercase tracking-[0.12em] text-slate-500">{item.category}</span>
            </div>
          </button>
        ))}
      </div>

      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4">
          <div className="relative w-full max-w-3xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-slate-700"
              aria-label="Close gallery"
            >
              <X size={18} />
            </button>

            <img alt={selectedItem.label} className="h-[420px] w-full object-cover" src={selectedItem.imageUrl} />

            <div className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{selectedItem.category}</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{selectedItem.label}</h3>
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={prevItem} className="rounded-full border border-slate-200 p-2 text-slate-700">
                  <ChevronLeft size={18} />
                </button>
                <button type="button" onClick={nextItem} className="rounded-full border border-slate-200 p-2 text-slate-700">
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default Gallery
