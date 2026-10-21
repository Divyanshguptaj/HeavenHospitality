import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import api from '../../lib/api'
import SectionHeading from '../common/SectionHeading'

function FAQ() {
  const [faqData, setFaqData] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [openIndex, setOpenIndex] = useState(0)

  useEffect(() => {
    let isActive = true

    api.get('/faqs')
      .then((response) => {
        const data = (response.data?.data || []).filter((item) => item.isActive !== false)
        if (isActive) setFaqData(data)
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  return (
    <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="FAQ"
        title="Common questions, answered clearly."
        description="The content is centralized and easy to update when final policies and details are confirmed."
        align="center"
      />

      {!isLoading && faqData.length === 0 && (
        <p className="mt-10 rounded-3xl border border-[#efe4d8] bg-white p-8 text-center text-slate-600">
          FAQs will be added here soon.
        </p>
      )}

      <div className="mt-10 space-y-4">
        {faqData.map((item, index) => {
          const isOpen = openIndex === index

          return (
            <div key={item.question} className="overflow-hidden rounded-2xl border border-[#efe4d8] bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-medium text-slate-800">{item.question}</span>
                <ChevronDown className={`transition ${isOpen ? 'rotate-180' : ''}`} size={18} />
              </button>

              {isOpen && <p className="border-t border-[#f1e7dc] px-5 py-4 text-sm leading-6 text-slate-600">{item.answer}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default FAQ
