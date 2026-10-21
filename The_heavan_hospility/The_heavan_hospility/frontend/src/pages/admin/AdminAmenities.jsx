import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const emptyAmenity = { name: '', icon: '', isActive: true }

function fetchAmenities() {
  return api.get('/amenities').then((response) => response.data?.data || [])
}

function AdminAmenities() {
  const navigate = useNavigate()
  const [amenities, setAmenities] = useState([])
  const [form, setForm] = useState(emptyAmenity)
  const [editingId, setEditingId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isActive = true

    fetchAmenities()
      .then((data) => {
        if (isActive) setAmenities(data)
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load amenities.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  async function loadAmenities() {
    setIsLoading(true)
    setError('')
    try {
      setAmenities(await fetchAmenities())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load amenities.')
    } finally {
      setIsLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyAmenity)
    setEditingId('')
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function openEdit(amenity) {
    setForm({ name: amenity.name || '', icon: amenity.icon || '', isActive: amenity.isActive !== false })
    setEditingId(amenity._id)
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    setEditingId('')
    setForm(emptyAmenity)
  }

  async function saveAmenity(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      const payload = { ...form, name: form.name.trim(), icon: form.icon.trim() }
      const config = { headers: { Authorization: `Bearer ${token}` } }

      if (editingId) {
        await api.patch(`/amenities/${editingId}`, payload, config)
        setNotice('Amenity updated.')
      } else {
        await api.post('/amenities', payload, config)
        setNotice('Amenity added.')
      }

      closeEditor()
      await loadAmenities()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save this amenity.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deleteAmenity(amenity) {
    if (!window.confirm(`Delete ${amenity.name}? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/amenities/${amenity._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setAmenities((current) => current.filter((item) => item._id !== amenity._id))
      setNotice(`${amenity.name} deleted.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this amenity.')
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
        <Link className="admin-side-current" to="/admin/amenities"><Sparkles size={16} /> Amenities</Link>
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
          <span>Management / Amenities</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadAmenities} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Property features</span>
              <h1>Amenities</h1>
              <p>Maintain the facilities and services shown to residents.</p>
            </div>
            <button className="admin-primary-button" onClick={openCreate} type="button">
              <Plus size={17} /> Add amenity
            </button>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {isEditorOpen && (
            <section className="admin-amenity-editor" aria-labelledby="amenity-editor-title">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-kicker">Facility details</span>
                  <h2 id="amenity-editor-title">{editingId ? 'Edit amenity' : 'Add an amenity'}</h2>
                </div>
                <button aria-label="Close amenity form" className="admin-icon-button" onClick={closeEditor} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="admin-amenity-form" onSubmit={saveAmenity}>
                <label>
                  Name
                  <input autoFocus maxLength="100" onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
                </label>
                <label>
                  Icon key
                  <input maxLength="60" onChange={(event) => setForm({ ...form, icon: event.target.value })} placeholder="e.g. wifi" value={form.icon} />
                </label>
                <label className="admin-amenity-active">
                  <input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />
                  Active
                </label>
                <div className="admin-amenity-actions">
                  <button className="admin-secondary-button" onClick={closeEditor} type="button">Cancel</button>
                  <button className="admin-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create amenity'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="admin-amenity-list" aria-label="Amenity list">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">Property features</span>
                <h2>All amenities</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${amenities.length} total`}</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Name</th><th>Icon key</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && amenities.map((amenity) => (
                    <tr key={amenity._id}>
                      <td><strong>{amenity.name}</strong></td>
                      <td>{amenity.icon || '—'}</td>
                      <td><span className={`admin-status ${amenity.isActive ? 'is-active' : 'is-inactive'}`}>{amenity.isActive ? 'Active' : 'Inactive'}</span></td>
                      <td className="admin-amenity-actions">
                        <button aria-label={`Edit ${amenity.name}`} className="admin-icon-button" onClick={() => openEdit(amenity)} type="button"><Pencil size={16} /></button>
                        <button aria-label={`Delete ${amenity.name}`} className="admin-icon-button is-danger" onClick={() => deleteAmenity(amenity)} type="button"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && amenities.length === 0 && (
                    <tr><td className="admin-empty" colSpan="4">No amenities yet. Add the first facility or service.</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="4">Loading amenities…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminAmenities