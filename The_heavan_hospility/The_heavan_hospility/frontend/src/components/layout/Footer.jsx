import { useSiteData } from '../../context/siteDataContext'

function Footer() {
  const { siteData, whatsappLink } = useSiteData()

  return (
    <footer className="border-t border-[#efe4d8] bg-[#fffaf5]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div className="lg:col-span-2">
          {siteData.brand && <h3 className="text-xl font-semibold text-slate-900">{siteData.brand}</h3>}
          {siteData.about.body && <p className="mt-4 max-w-md text-sm text-slate-600">{siteData.about.body}</p>}
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Explore</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {siteData.navLinks.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition hover:text-[#8d5c2c]">{link.label}</a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Contact</h4>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {siteData.phone && <li>{siteData.phone}</li>}
            {siteData.email && <li>{siteData.email}</li>}
            {siteData.address && <li>{siteData.address}</li>}
            {whatsappLink && (
              <li>
                <a href={whatsappLink} target="_blank" rel="noreferrer" className="hover:text-[#8d5c2c]">
                  WhatsApp
                </a>
              </li>
            )}
            {!siteData.phone && !siteData.email && !siteData.address && !whatsappLink && (
              <li className="text-slate-400">Contact details coming soon.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-[#efe4d8]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm text-slate-500 sm:px-6 lg:flex-row lg:px-8">
          <p>© 2026 {siteData.brand}. All rights reserved.</p>
          <div className="flex gap-4">
            {siteData.socialLinks.map((link) => (
              <a key={link.label} href={link.href} className="hover:text-[#8d5c2c]">
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
