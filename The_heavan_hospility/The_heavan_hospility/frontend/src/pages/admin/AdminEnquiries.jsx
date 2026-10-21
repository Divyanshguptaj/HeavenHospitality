import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageCircleMore, MessageSquareQuote, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const statuses = ['New', 'Contacted', 'Follow-up', 'Converted', 'Closed']

function buildWhatsappReplyLink(enquiry, businessName) {
  const guestNumber = (enquiry.phone || '').replace(/\D/g, '')
  if (!guestNumber) return null

  const moveIn = enquiry.moveInDate ? new Date(enquiry.moveInDate).toLocaleDateString('en-IN') : ''
  const lines = [
    `Hi ${enquiry.name}, this is ${businessName || 'The Heaven Hospitality'} regarding your enquiry` + (enquiry.roomType ? ` for ${enquiry.roomType}` : '') + '.',
    moveIn ? `You mentioned a move-in date of ${moveIn}.` : '',
  ].filter(Boolean)

  return `https://wa.me/${guestNumber}?text=${encodeURIComponent(lines.join(' '))}`
}

function fetchEnquiries(token) {
  return api.get('/enquiries', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => response.data?.data || [])
}

function formatDate(value) {
  if (!value) return 'Not set'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not set' : date.toLocaleDateString()
}

function AdminEnquiries() {
  const navigate = useNavigate()
  const [enquiries, setEnquiries] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All statuses')
  const [updatingId, setUpdatingId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
  const [businessName, setBusinessName] = useState('')

  useEffect(() => {
    let isActive = true

    api.get('/settings')
      .then((response) => {
        const settings = response.data?.data || {}
        if (isActive) {
          setWhatsappEnabled(Boolean((settings.whatsapp || '').trim()))
          setBusinessName(settings.businessName || '')
        }
      })
      .catch(() => {})

    return () => { isActive = false }
  }, [])

  useEffect(() => {
    let isActive = true
    const token = window.localStorage.getItem('adminToken')

    fetchEnquiries(token)
      .then((data) => {
        if (isActive) setEnquiries(data)
      })
      .catch((requestError) => {
        if (!isActive) return
        if (requestError.response?.status === 401) {
          window.localStorage.removeItem('adminToken')
          navigate('/admin/login', { replace: true })
          return
        }
        setError(requestError.response?.data?.message || 'Could not load enquiries.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [navigate])

  async function loadEnquiries() {
    setIsLoading(true)
    setError('')
    const token = window.localStorage.getItem('adminToken')

    try {
      setEnquiries(await fetchEnquiries(token))
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not load enquiries.')
    } finally {
      setIsLoading(false)
    }
  }

  async function updateStatus(enquiry, status) {
    setUpdatingId(enquiry._id)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/enquiries/${enquiry._id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setEnquiries((current) => current.map((item) => (
        item._id === enquiry._id ? { ...item, status: updated?.status || status } : item
      )))
      setNotice(`Status updated for ${enquiry.name}.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update this enquiry.')
    } finally {
      setUpdatingId('')
    }
  }

  async function deleteEnquiry(enquiry) {
    if (!window.confirm(`Delete the enquiry from ${enquiry.name}? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/enquiries/${enquiry._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setEnquiries((current) => current.filter((item) => item._id !== enquiry._id))
      setNotice(`Enquiry from ${enquiry.name} deleted.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this enquiry.')
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
  }

  const visibleEnquiries = enquiries.filter((enquiry) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [enquiry.name, enquiry.email, enquiry.phone, enquiry.roomType]
      .some((value) => value?.toLowerCase().includes(query))
    return matchesSearch && (statusFilter === 'All statuses' || enquiry.status === statusFilter)
  })

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
        <Link className="admin-side-current" to="/admin/enquiries"><ClipboardList size={16} /> Enquiries</Link>
        <Link className="admin-side-link" to="/admin/reviews"><MessageSquareQuote size={16} /> Reviews</Link>
        <Link className="admin-side-link" to="/admin/amenities"><Sparkles size={16} /> Amenities</Link>
        <Link className="admin-side-link" to="/admin/gallery"><Images size={16} /> Gallery</Link>
        <Link className="admin-side-link" to="/admin/food"><UtensilsCrossed size={16} /> Food & dining</Link>
        <Link className="admin-side-link" to="/admin/faq"><HelpCircle size={16} /> FAQ</Link>
        <Link className="admin-side-link" to="/admin/offers"><Tag size={16} /> Special offer</Link>
        <Link className="admin-side-link" to="/admin/settings"><Settings2 size={16} /> Website settings</Link>
        <a className="admin-side-public" href="/">View public website <ArrowUpRight size={15} /></a>
        <button className="admin-logout" onClick={handleLogout} type="button">
          <LogOut size={17} /> Sign out
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <span>Management / Enquiries</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadEnquiries} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Guest requests</span>
              <h1>Enquiries</h1>
              <p>Follow up with prospective residents and track each request.</p>
            </div>
            <span className="admin-table-count">{isLoading ? 'Loading' : `${visibleEnquiries.length} of ${enquiries.length}`}</span>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          <div className="admin-enquiry-tools">
            <input
              aria-label="Search enquiries"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, email, phone, or room"
              type="search"
              value={search}
            />
            <select aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option>All statuses</option>
              {statuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </div>

          <section className="admin-room-list admin-enquiry-table" aria-label="Guest enquiries">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Guest</th><th>Contact</th><th>Room interest</th><th>Move-in</th><th>Received</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && visibleEnquiries.map((enquiry) => (
                    <tr key={enquiry._id}>
                      <td><strong>{enquiry.name}</strong><small className="admin-enquiry-message" title={enquiry.message}>{enquiry.message || 'No message'}</small></td>
                      <td>
                        <a className="admin-enquiry-contact" href={`tel:${enquiry.phone}`}>{enquiry.phone}</a>
                        <small><a className="admin-enquiry-contact" href={`mailto:${enquiry.email}`}>{enquiry.email}</a></small>
                      </td>
                      <td>{enquiry.roomType}</td>
                      <td>{formatDate(enquiry.moveInDate)}</td>
                      <td>{formatDate(enquiry.createdAt)}</td>
                      <td>
                        <select
                          aria-label={`Status for ${enquiry.name}`}
                          className="admin-status-select"
                          disabled={updatingId === enquiry._id}
                          onChange={(event) => updateStatus(enquiry, event.target.value)}
                          value={enquiry.status}
                        >
                          {statuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      </td>
                      <td className="admin-enquiry-actions">
                        {whatsappEnabled && buildWhatsappReplyLink(enquiry, businessName) && (
                          <a
                            aria-label={`Reply to ${enquiry.name} on WhatsApp`}
                            className="admin-icon-button"
                            href={buildWhatsappReplyLink(enquiry, businessName)}
                            rel="noreferrer"
                            target="_blank"
                            title="Reply on WhatsApp"
                          ><MessageCircleMore size={16} /></a>
                        )}
                        <button
                          aria-label={`Delete enquiry from ${enquiry.name}`}
                          className="admin-icon-button is-danger"
                          onClick={() => deleteEnquiry(enquiry)}
                          type="button"
                        ><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && visibleEnquiries.length === 0 && (
                    <tr><td className="admin-empty" colSpan="7">{enquiries.length ? 'No enquiries match these filters.' : 'No enquiries received yet.'}</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="7">Loading enquiries…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminEnquiries