import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const emptyOffer = { title: '', amount: '', description: '', startDate: '', endDate: '', isActive: true }

function toDateInputValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function fetchOffers(token) {
  return api.get('/offers', { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.data?.data || [])
}

function AdminOffers() {
  const navigate = useNavigate()
  const [offers, setOffers] = useState([])
  const [form, setForm] = useState(emptyOffer)
  const [editingId, setEditingId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function loadOffers() {
    setIsLoading(true)
    setError('')
    try {
      const token = window.localStorage.getItem('adminToken')
      setOffers(await fetchOffers(token))
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not load special offers.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadOffers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openCreate() {
    setForm(emptyOffer)
    setEditingId('')
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function openEdit(offer) {
    setForm({
      title: offer.title || '',
      amount: offer.amount || '',
      description: offer.description || '',
      startDate: toDateInputValue(offer.startDate),
      endDate: toDateInputValue(offer.endDate),
      isActive: offer.isActive !== false,
    })
    setEditingId(offer._id)
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    setEditingId('')
    setForm(emptyOffer)
  }

  async function saveOffer(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      const payload = {
        title: form.title.trim(),
        amount: form.amount.trim(),
        description: form.description.trim(),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isActive: form.isActive,
      }
      const config = { headers: { Authorization: `Bearer ${token}` } }

      if (editingId) {
        await api.patch(`/offers/${editingId}`, payload, config)
        setNotice('Special offer updated.')
      } else {
        await api.post('/offers', payload, config)
        setNotice('Special offer added.')
      }

      closeEditor()
      await loadOffers()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save this offer.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleActive(offer) {
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/offers/${offer._id}`, { isActive: !offer.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setOffers((current) => current.map((item) => (item._id === offer._id ? { ...item, ...updated } : item)))
      setNotice(`Offer ${updated?.isActive ? 'activated' : 'deactivated'}.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update this offer.')
    }
  }

  async function deleteOffer(offer) {
    if (!window.confirm(`Delete "${offer.title}"? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/offers/${offer._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setOffers((current) => current.filter((item) => item._id !== offer._id))
      setNotice('Special offer deleted.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this offer.')
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
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
        <Link className="admin-side-current" to="/admin/offers"><Tag size={16} /> Special offer</Link>
        <Link className="admin-side-link" to="/admin/settings"><Settings2 size={16} /> Website settings</Link>
        <a className="admin-side-public" href="/">View public website <ArrowUpRight size={15} /></a>
        <button className="admin-logout" onClick={handleLogout} type="button">
          <LogOut size={17} /> Sign out
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <span>Management / Special offer</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadOffers} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Promotions</span>
              <h1>Special offer</h1>
              <p>Manage limited-time offers shown on the public website. Only one active, in-range offer is shown at a time.</p>
            </div>
            <button className="admin-primary-button" onClick={openCreate} type="button">
              <Plus size={17} /> Add offer
            </button>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {isEditorOpen && (
            <section className="admin-room-editor" aria-labelledby="offer-editor-title">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-kicker">Offer details</span>
                  <h2 id="offer-editor-title">{editingId ? 'Edit offer' : 'Add an offer'}</h2>
                </div>
                <button aria-label="Close offer form" className="admin-icon-button" onClick={closeEditor} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="admin-room-form" onSubmit={saveOffer}>
                <label>
                  Title
                  <input autoFocus maxLength="120" onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} />
                </label>
                <label>
                  Amount / discount
                  <input maxLength="60" onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="e.g. 10% OFF or ₹2,000 off" required value={form.amount} />
                </label>
                <label>
                  Starts on <span>Optional — leave blank for always-on</span>
                  <input onChange={(event) => setForm({ ...form, startDate: event.target.value })} type="date" value={form.startDate} />
                </label>
                <label>
                  Ends on <span>Optional — leave blank for no end date</span>
                  <input onChange={(event) => setForm({ ...form, endDate: event.target.value })} type="date" value={form.endDate} />
                </label>
                <label className="admin-room-wide">
                  Description <span>Optional</span>
                  <textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows="3" value={form.description} />
                </label>
                <label className="admin-room-active">
                  <input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />
                  Active
                </label>
                <div className="admin-room-form-actions">
                  <button className="admin-secondary-button" onClick={closeEditor} type="button">Cancel</button>
                  <button className="admin-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create offer'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="admin-room-list" aria-label="Special offers">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">All offers</span>
                <h2>Offers</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${offers.length} total`}</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Title</th><th>Amount</th><th>Window</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && offers.map((offer) => (
                    <tr key={offer._id}>
                      <td><strong>{offer.title}</strong></td>
                      <td>{offer.amount}</td>
                      <td>{toDateInputValue(offer.startDate) || 'Any'} → {toDateInputValue(offer.endDate) || 'Any'}</td>
                      <td>
                        <button
                          aria-label={`${offer.isActive ? 'Deactivate' : 'Activate'} "${offer.title}"`}
                          className={`admin-status ${offer.isActive ? 'is-active' : 'is-inactive'}`}
                          onClick={() => toggleActive(offer)}
                          style={{ cursor: 'pointer', border: 'none' }}
                          type="button"
                        >{offer.isActive ? 'Active' : 'Inactive'}</button>
                      </td>
                      <td className="admin-room-actions">
                        <button aria-label={`Edit "${offer.title}"`} className="admin-icon-button" onClick={() => openEdit(offer)} type="button"><Pencil size={16} /></button>
                        <button aria-label={`Delete "${offer.title}"`} className="admin-icon-button is-danger" onClick={() => deleteOffer(offer)} type="button"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && offers.length === 0 && (
                    <tr><td className="admin-empty" colSpan="5">No offers yet. Add one to promote it on the public site.</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="5">Loading offers…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminOffers
