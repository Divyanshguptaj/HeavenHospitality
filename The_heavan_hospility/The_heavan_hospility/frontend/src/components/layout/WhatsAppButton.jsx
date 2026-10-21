import { MessageCircleMore } from 'lucide-react'
import { useSiteData } from '../../context/siteDataContext'

function WhatsAppButton() {
  const { whatsappLink } = useSiteData()

  if (!whatsappLink) return null

  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-green-500/30 transition hover:scale-105"
      aria-label="WhatsApp"
    >
      <MessageCircleMore size={24} />
    </a>
  )
}

export default WhatsAppButton
