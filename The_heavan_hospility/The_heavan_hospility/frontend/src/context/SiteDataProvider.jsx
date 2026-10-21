import { useEffect, useState } from 'react'
import api from '../lib/api'
import { siteData as fallbackSiteData } from '../data/siteData'
import { SiteDataContext } from './siteDataContext'

function mapSettingsToSiteData(settings) {
  // Only structural fields (navLinks, CTA labels/hrefs) come from the frontend
  // fallback. Every business-content field uses the backend value as-is — an
  // empty/missing field in Website Settings stays empty here, it never falls
  // back to developer-written content.
  const brand = settings.businessName || ''
  const socialLinks = [
    ['Instagram', 'instagram'],
    ['Facebook', 'facebook'],
    ['LinkedIn', 'linkedin'],
  ].map(([label, key]) => ({
    label,
    href: settings.socialLinks?.[key] || '#',
  }))
  const phoneNumber = (settings.whatsapp || '').replace(/\D/g, '')
  const nextSiteData = {
    ...fallbackSiteData,
    brand,
    phone: settings.phone || '',
    whatsapp: settings.whatsapp || '',
    email: settings.email || '',
    address: settings.address || '',
    googleMapsUrl: settings.googleMapsUrl || '',
    socialLinks,
    hero: {
      ...fallbackSiteData.hero,
      eyebrow: settings.heroContent?.eyebrow || '',
      title: settings.heroContent?.title || '',
      description: settings.heroContent?.description || '',
    },
    about: {
      heading: settings.aboutContent?.heading || '',
      body: settings.aboutContent?.body || '',
    },
  }

  return {
    siteData: nextSiteData,
    whatsappLink: phoneNumber
      ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(`Hello ${brand || 'there'}`)}`
      : null,
  }
}

function SiteDataProvider({ children }) {
  const [content, setContent] = useState({
    siteData: fallbackSiteData,
    whatsappLink: null,
  })

  useEffect(() => {
    let isActive = true

    api.get('/settings')
      .then((response) => {
        if (isActive) setContent(mapSettingsToSiteData(response.data?.data || {}))
      })
      .catch(() => {})

    return () => { isActive = false }
  }, [])

  return (
    <SiteDataContext.Provider value={content}>
      {children}
    </SiteDataContext.Provider>
  )
}

export default SiteDataProvider