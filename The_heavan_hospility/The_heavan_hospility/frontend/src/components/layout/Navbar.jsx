import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSiteData } from '../../context/siteDataContext'
import Button from '../common/Button'

function Navbar() {
  const [open, setOpen] = useState(false)
  const { siteData } = useSiteData()

  return (
    <header className="sticky top-0 z-50 border-b border-[#efe4d8] bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="text-lg font-semibold tracking-tight text-slate-900">
          {siteData.brand}
        </Link>

        <div className="hidden items-center gap-5 lg:gap-8 md:flex">
          {siteData.navLinks.map((link) => (
            <a key={link.label} href={link.href} className="text-sm font-medium text-slate-600 transition hover:text-[#8d5c2c]">
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:gap-5 md:flex">
          <Link to="/admin/login" className="text-sm font-medium text-slate-400 transition hover:text-[#8d5c2c]">
            Admin Login
          </Link>
          <a href="#enquiry">
            <Button variant="primary">Enquire Now</Button>
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="rounded-full border border-slate-200 p-2 md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-[#efe4d8] bg-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6">
            {siteData.navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-700"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link to="/admin/login" className="text-sm font-medium text-slate-500" onClick={() => setOpen(false)}>
              Admin Login
            </Link>
            <a href="#enquiry" onClick={() => setOpen(false)}>
              <Button variant="primary" className="w-full">Enquire Now</Button>
            </a>
          </div>
        </div>
      )}
    </header>
  )
}

export default Navbar
