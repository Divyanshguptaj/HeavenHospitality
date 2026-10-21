// Structural UI configuration only. Real business content (brand name, contact
// details, address, hero/about copy) comes exclusively from the backend
// WebsiteSettings API via SiteDataProvider — nothing here is shown as business
// data when the backend has none.
export const siteData = {
  brand: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  googleMapsUrl: '',
  navLinks: [
    { label: 'Home', href: '#home' },
    { label: 'About', href: '#about' },
    { label: 'Rooms', href: '#rooms' },
    { label: 'Amenities', href: '#amenities' },
    { label: 'Gallery', href: '#gallery' },
    { label: 'Reviews', href: '#reviews' },
    { label: 'Location', href: '#location' },
  ],
  socialLinks: [
    { label: 'Instagram', href: '#' },
    { label: 'Facebook', href: '#' },
    { label: 'LinkedIn', href: '#' },
  ],
  hero: {
    eyebrow: '',
    title: '',
    description: '',
    primaryCta: { label: 'Explore Rooms', href: '#rooms' },
    secondaryCta: { label: 'Enquire Now', href: '#enquiry' },
  },
  about: {
    heading: '',
    body: '',
  },
}

// No generic/default WhatsApp link — a real link is only built once a real
// WhatsApp number is configured in Website Settings (see SiteDataProvider).
export const whatsappLink = null
