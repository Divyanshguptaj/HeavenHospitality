import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, Check, ClipboardList, DatabaseBackup, HelpCircle, Images, LogOut, MessageSquareQuote, RefreshCw, Settings2, Sparkles, Tag, UtensilsCrossed } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const defaultSettings = {
  businessName: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  googleMapsUrl: '',
  socialLinks: { instagram: '', facebook: '', linkedin: '' },
  heroContent: { eyebrow: '', title: '', description: '' },
  aboutContent: { heading: '', body: '' },
}

function mergeSettings(data) {
  return {
    ...defaultSettings,
    ...data,
    socialLinks: { ...defaultSettings.socialLinks, ...data?.socialLinks },
    heroContent: { ...defaultSettings.heroContent, ...data?.heroContent },
    aboutContent: { ...defaultSettings.aboutContent, ...data?.aboutContent },
  }
}

function SettingsFields({ fields, onChange, values }) {
  return fields.map(([key, label, type = 'text', isWide = false]) => (
    <label className={isWide ? 'admin-settings-wide' : ''} key={key}>
      {label}
      {type === 'textarea' ? (
        <textarea onChange={(event) => onChange(key, event.target.value)} rows="3" value={values[key] || ''} />
      ) : (
        <input onChange={(event) => onChange(key, event.target.value)} type={type} value={values[key] || ''} />
      )}
    </label>
  ))
}

function AdminSettings() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState(defaultSettings)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isBackingUp, setIsBackingUp] = useState(false)

  useEffect(() => {
    let isActive = true

    api.get('/settings')
      .then((response) => {
        if (isActive) setSettings(mergeSettings(response.data?.data || {}))
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load website settings.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  async function reloadSettings() {
    setIsLoading(true)
    setError('')
    try {
      const response = await api.get('/settings')
      setSettings(mergeSettings(response.data?.data || {}))
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load website settings.')
    } finally {
      setIsLoading(false)
    }
  }

  function updateField(key, value) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function updateSection(section, key, value) {
    setSettings((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }))
  }

  async function saveSettings(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')

    const payload = {
      businessName: settings.businessName.trim(),
      phone: settings.phone.trim(),
      whatsapp: settings.whatsapp.trim(),
      email: settings.email.trim(),
      address: settings.address.trim(),
      googleMapsUrl: settings.googleMapsUrl.trim(),
      socialLinks: settings.socialLinks,
      heroContent: settings.heroContent,
      aboutContent: settings.aboutContent,
    }

    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch('/settings', payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setSettings(mergeSettings(response.data?.data || payload))
      setNotice('Website settings saved.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save website settings.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
  }

  async function downloadBackup() {
    setIsBackingUp(true)
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.get('/backup', {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      link.download = `heaven-hospitality-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setNotice('Backup downloaded.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError('Could not generate the backup. Please try again.')
    } finally {
      setIsBackingUp(false)
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <span className="admin-brand-mark">H</span>
          <span>The Heaven <small>HOSPITALITY</small></span>
        </a>
        <div className="admin-side-label">Workspace</div>
        <Link className="admin-side-link" to="/admin">Overview</Link>
        <Link className="admin-side-link" to="/admin/rooms"><BedDouble size={16} /> Rooms</Link>
        <Link className="admin-side-link" to="/admin/enquiries"><ClipboardList size={16} /> Enquiries</Link>
        <Link className="admin-side-link" to="/admin/reviews"><MessageSquareQuote size={16} /> Reviews</Link>
        <Link className="admin-side-link" to="/admin/amenities"><Sparkles size={16} /> Amenities</Link>
        <Link className="admin-side-link" to="/admin/gallery"><Images size={16} /> Gallery</Link>
        <Link className="admin-side-link" to="/admin/food"><UtensilsCrossed size={16} /> Food & dining</Link>
        <Link className="admin-side-link" to="/admin/faq"><HelpCircle size={16} /> FAQ</Link>
        <Link className="admin-side-link" to="/admin/offers"><Tag size={16} /> Special offer</Link>
        <Link className="admin-side-current" to="/admin/settings"><Settings2 size={16} /> Website settings</Link>
        <a className="admin-side-public" href="/">View public website <ArrowUpRight size={15} /></a>
        <button className="admin-logout" onClick={handleLogout} type="button"><LogOut size={17} /> Sign out</button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <span>Management / Website settings</span>
          <button className="admin-refresh" disabled={isLoading} onClick={reloadSettings} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Site configuration</span>
              <h1>Website settings</h1>
              <p>Manage the property’s contact details and primary page copy.</p>
            </div>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          <form onSubmit={saveSettings}>
            <section className="admin-settings-section" aria-labelledby="business-settings-title">
              <div className="admin-section-heading">
                <div><span className="admin-kicker">Property details</span><h2 id="business-settings-title">Business information</h2></div>
              </div>
              <div className="admin-settings-fields">
                <SettingsFields
                  fields={[
                    ['businessName', 'Business name'],
                    ['email', 'Email address', 'email'],
                    ['phone', 'Phone number', 'tel'],
                    ['whatsapp', 'WhatsApp number', 'tel'],
                    ['googleMapsUrl', 'Google Maps URL', 'url'],
                    ['address', 'Property address', 'textarea', true],
                  ]}
                  onChange={updateField}
                  values={settings}
                />
              </div>
            </section>

            <section className="admin-settings-section" aria-labelledby="hero-settings-title">
              <div className="admin-section-heading">
                <div><span className="admin-kicker">Homepage</span><h2 id="hero-settings-title">Hero content</h2></div>
              </div>
              <div className="admin-settings-fields">
                <SettingsFields
                  fields={[
                    ['eyebrow', 'Eyebrow'],
                    ['title', 'Main heading'],
                    ['description', 'Description', 'textarea', true],
                  ]}
                  onChange={(key, value) => updateSection('heroContent', key, value)}
                  values={settings.heroContent}
                />
              </div>
            </section>

            <section className="admin-settings-section" aria-labelledby="about-settings-title">
              <div className="admin-section-heading">
                <div><span className="admin-kicker">Homepage</span><h2 id="about-settings-title">About content</h2></div>
              </div>
              <div className="admin-settings-fields">
                <SettingsFields
                  fields={[
                    ['heading', 'Heading', 'text', true],
                    ['body', 'Body copy', 'textarea', true],
                  ]}
                  onChange={(key, value) => updateSection('aboutContent', key, value)}
                  values={settings.aboutContent}
                />
              </div>
            </section>

            <section className="admin-settings-section" aria-labelledby="social-settings-title">
              <div className="admin-section-heading">
                <div><span className="admin-kicker">Social media</span><h2 id="social-settings-title">Social links</h2></div>
              </div>
              <div className="admin-settings-fields">
                <SettingsFields
                  fields={[
                    ['instagram', 'Instagram URL', 'url'],
                    ['facebook', 'Facebook URL', 'url'],
                    ['linkedin', 'LinkedIn URL', 'url'],
                  ]}
                  onChange={(key, value) => updateSection('socialLinks', key, value)}
                  values={settings.socialLinks}
                />
              </div>
            </section>

            <div className="admin-settings-save">
              <button className="admin-primary-button" disabled={isSaving || isLoading} type="submit">
                <Check size={16} /> {isSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>

          <section className="admin-settings-section" aria-labelledby="backup-settings-title">
            <div className="admin-section-heading">
              <div><span className="admin-kicker">Data safety</span><h2 id="backup-settings-title">Backup</h2></div>
            </div>
            <div className="admin-settings-fields">
              <p className="admin-room-wide" style={{ margin: 0, color: '#6b6258' }}>
                Download a complete JSON export of your rooms, amenities, gallery, food, reviews, enquiries, FAQs, special offers, and website settings. Admin account credentials are never included.
              </p>
              <button className="admin-secondary-button" disabled={isBackingUp} onClick={downloadBackup} type="button">
                <DatabaseBackup size={16} /> {isBackingUp ? 'Preparing backup…' : 'Download backup'}
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminSettings