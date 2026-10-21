import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, RefreshCw, Settings2, Sparkles, Tag, UtensilsCrossed } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const modules = [
  { key: 'rooms', label: 'Active rooms', description: 'Room inventory', compute: (records) => records.rooms.filter((room) => room.isActive).length },
  { key: 'vacantBeds', label: 'Vacant beds', description: 'Across active rooms', compute: (records) => records.rooms.filter((room) => room.isActive).reduce((sum, room) => sum + (room.vacantBeds || 0), 0) },
  { key: 'enquiries', label: 'Enquiries', description: 'Guest requests', compute: (records) => records.enquiries.length },
  { key: 'reviews', label: 'Reviews', description: 'Guest feedback', compute: (records) => records.reviews.length },
]

function fetchOverview(token) {
  const headers = { Authorization: `Bearer ${token}` }

  return Promise.all([
    api.get('/rooms', { headers }),
    api.get('/enquiries', { headers }),
    api.get('/reviews', { headers }),
  ]).then(([rooms, enquiries, reviews]) => ({
    rooms: rooms.data?.data || [],
    enquiries: enquiries.data?.data || [],
    reviews: reviews.data?.data || [],
  }))
}

function AdminDashboard() {
  const navigate = useNavigate()
  const [records, setRecords] = useState({ rooms: [], enquiries: [], reviews: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const loadOverview = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsLoading(true)
      setError('')
    }
    try {
      const token = window.localStorage.getItem('adminToken')
      setRecords(await fetchOverview(token))
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }

      setError(
        requestError.response?.data?.message ||
          'Could not load the overview. Check that the backend and database are running.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    let isActive = true
    const token = window.localStorage.getItem('adminToken')

    fetchOverview(token)
      .then((data) => {
        if (isActive) setRecords(data)
      })
      .catch((requestError) => {
        if (!isActive) return
        if (requestError.response?.status === 401) {
          window.localStorage.removeItem('adminToken')
          navigate('/admin/login', { replace: true })
          return
        }
        setError(
          requestError.response?.data?.message ||
            'Could not load the overview. Check that the backend and database are running.',
        )
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [navigate])

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
  }

  const recentEnquiries = [...records.enquiries]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 5)

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <span className="admin-brand-mark">H</span>
          <span>The Heaven <small>HOSPITALITY</small></span>
        </a>
        <div className="admin-side-label">Workspace</div>
        <Link className="admin-side-current" to="/admin">Overview</Link>
        <Link className="admin-side-link" to="/admin/rooms"><BedDouble size={16} /> Rooms</Link>
        <Link className="admin-side-link" to="/admin/enquiries"><ClipboardList size={16} /> Enquiries</Link>
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
          <span>Management / Overview</span>
          <button className="admin-refresh" disabled={isLoading} onClick={() => loadOverview(true)} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">The Heaven Hospitality</span>
              <h1>Overview</h1>
              <p>Your property, at a glance.</p>
            </div>
            <span className="admin-live-status"><i /> Live data</span>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}

          <div className="admin-stat-grid" aria-live="polite">
            {modules.map((module, index) => (
              <article className="admin-stat" key={module.key}>
                <span className="admin-stat-index">0{index + 1}</span>
                <span className="admin-stat-label">{module.label}</span>
                <strong>{isLoading ? '—' : module.compute(records)}</strong>
                <span className="admin-stat-description">{module.description}</span>
              </article>
            ))}
          </div>

          <section className="admin-table-section" aria-labelledby="enquiries-title">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">Guest requests</span>
                <h2 id="enquiries-title">Recent enquiries</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${records.enquiries.length} total`}</span>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Guest</th><th>Room interest</th><th>Received</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {!isLoading && recentEnquiries.map((enquiry) => (
                    <tr key={enquiry._id}>
                      <td><strong>{enquiry.name}</strong><small>{enquiry.email}</small></td>
                      <td>{enquiry.roomType}</td>
                      <td>{new Date(enquiry.createdAt).toLocaleDateString()}</td>
                      <td><span className="admin-status">{enquiry.status}</span></td>
                    </tr>
                  ))}
                  {!isLoading && recentEnquiries.length === 0 && (
                    <tr><td className="admin-empty" colSpan="4">No enquiries to show yet.</td></tr>
                  )}
                  {isLoading && (
                    <tr><td className="admin-empty" colSpan="4">Loading live enquiries…</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminDashboard