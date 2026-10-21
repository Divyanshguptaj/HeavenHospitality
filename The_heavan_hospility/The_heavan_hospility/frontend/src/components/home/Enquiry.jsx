import { useState } from 'react'
import { MessageCircleMore } from 'lucide-react'
import api from '../../lib/api'
import { useSiteData } from '../../context/siteDataContext'
import Button from '../common/Button'
import SectionHeading from '../common/SectionHeading'

const initialForm = {
  name: '',
  phone: '',
  email: '',
  roomType: '',
  moveInDate: '',
  message: '',
}

function buildWhatsappMessage(form, brand) {
  return [
    `New Enquiry - ${brand}`,
    '',
    `Name: ${form.name}`,
    `Phone: ${form.phone}`,
    `Email: ${form.email}`,
    `Query: ${form.message}`,
  ].join('\n')
}

function Enquiry() {
  const { siteData } = useSiteData()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [submitError, setSubmitError] = useState('')

  const whatsappNumber = (siteData.whatsapp || '').replace(/\D/g, '')

  const validate = () => {
    const nextErrors = {}
    if (!form.name.trim()) nextErrors.name = 'Name is required.'
    if (!form.phone.trim()) nextErrors.phone = 'Phone is required.'
    if (!form.email.trim()) nextErrors.email = 'Email is required.'
    if (!form.roomType.trim()) nextErrors.roomType = 'Room type is required.'
    if (!form.message.trim()) nextErrors.message = 'Message is required.'
    return nextErrors
  }

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const nextErrors = validate()
    setErrors(nextErrors)
    setNotice('')
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await api.post('/enquiries', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        roomType: form.roomType.trim(),
        moveInDate: form.moveInDate || null,
        message: form.message.trim(),
      })
      setForm(initialForm)
      setNotice('Your enquiry has been submitted successfully. We will contact you soon.')
    } catch (requestError) {
      setSubmitError(requestError.response?.data?.message || 'Could not submit your enquiry. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWhatsappClick = () => {
    const nextErrors = validate()
    setErrors(nextErrors)
    setNotice('')
    setSubmitError('')

    if (Object.keys(nextErrors).length > 0 || !whatsappNumber) return

    const message = buildWhatsappMessage(form, siteData.brand)
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank', 'noreferrer')
  }

  return (
    <section id="enquiry" className="bg-[#f8f5f1] py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Enquiry"
          title="Ask about availability, room options, and move-in details."
          description="This form is prepared for backend integration and includes frontend validation for a reliable user experience."
          align="center"
        />

        <form onSubmit={handleSubmit} className="mx-auto mt-10 max-w-3xl rounded-[2rem] border border-[#efe4d8] bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
              <input name="name" value={form.name} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]" />
              {errors.name && <p className="mt-2 text-xs text-red-500">{errors.name}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Phone</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]" />
              {errors.phone && <p className="mt-2 text-xs text-red-500">{errors.phone}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]" />
              {errors.email && <p className="mt-2 text-xs text-red-500">{errors.email}</p>}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Room Type</label>
              <select name="roomType" value={form.roomType} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]">
                <option value="">Select</option>
                <option value="Single Sharing">Single Sharing</option>
                <option value="2 Sharing">2 Sharing</option>
                <option value="3 Sharing">3 Sharing</option>
                <option value="4 Sharing">4 Sharing</option>
              </select>
              {errors.roomType && <p className="mt-2 text-xs text-red-500">{errors.roomType}</p>}
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Move-in Date</label>
              <input type="date" name="moveInDate" value={form.moveInDate} onChange={handleChange} className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]" />
            </div>

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Message</label>
              <textarea name="message" value={form.message} onChange={handleChange} rows="5" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#c98a4b]" />
              {errors.message && <p className="mt-2 text-xs text-red-500">{errors.message}</p>}
            </div>
          </div>

          {notice && <p className="mt-6 text-center text-sm font-medium text-emerald-600" role="status">{notice}</p>}
          {submitError && <p className="mt-6 text-center text-sm font-medium text-red-500" role="alert">{submitError}</p>}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Button type="submit" variant="primary" className="min-w-[180px]" disabled={isSubmitting}>
              {isSubmitting ? 'Sending…' : 'Send Enquiry'}
            </Button>

            {whatsappNumber && (
              <button
                type="button"
                onClick={handleWhatsappClick}
                className="inline-flex min-w-[180px] items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-[#1fb855]"
              >
                <MessageCircleMore size={17} /> Enquire on WhatsApp
              </button>
            )}
          </div>
          {!whatsappNumber && (
            <p className="mt-3 text-center text-xs text-slate-500">
              WhatsApp enquiries will be available here once a WhatsApp number is added in Admin Settings.
            </p>
          )}
        </form>
      </div>
    </section>
  )
}

export default Enquiry
