import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const emptyFood = { title: '', description: '', imageUrl: '', isActive: true }

function fetchFoodItems() {
  return api.get('/food').then((response) => response.data?.data || [])
}

function AdminFood() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [form, setForm] = useState(emptyFood)
  const [editingId, setEditingId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isActive = true

    fetchFoodItems()
      .then((data) => {
        if (isActive) setItems(data)
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load food content.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  async function loadFoodItems() {
    setIsLoading(true)
    setError('')
    try {
      setItems(await fetchFoodItems())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load food content.')
    } finally {
      setIsLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyFood)
    setEditingId('')
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function openEdit(item) {
    setForm({
      title: item.title || '',
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      isActive: item.isActive !== false,
    })
    setEditingId(item._id)
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    setEditingId('')
    setForm(emptyFood)
  }

  async function saveFoodItem(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      const payload = {
        ...form,
        title: form.title.trim(),
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
      }
      const config = { headers: { Authorization: `Bearer ${token}` } }

      if (editingId) {
        await api.patch(`/food/${editingId}`, payload, config)
        setNotice('Dining content updated.')
      } else {
        await api.post('/food', payload, config)
        setNotice('Dining content added.')
      }

      closeEditor()
      await loadFoodItems()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save this dining entry.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleVisibility(item) {
    setUpdatingId(item._id)
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/food/${item._id}`, { isActive: !item.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...updated } : entry))
      setNotice(`${item.title} ${updated?.isActive ? 'shown' : 'hidden'} on the public site.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update visibility.')
    } finally {
      setUpdatingId('')
    }
  }

  async function deleteFoodItem(item) {
    if (!window.confirm(`Delete ${item.title}? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/food/${item._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems((current) => current.filter((entry) => entry._id !== item._id))
      setNotice(`${item.title} deleted.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this dining entry.')
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
        <Link className="admin-side-current" to="/admin/food"><UtensilsCrossed size={16} /> Food & dining</Link>
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
          <span>Management / Food & dining</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadFoodItems} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Dining content</span>
              <h1>Food & dining</h1>
              <p>Manage meal information and dining highlights.</p>
            </div>
            <button className="admin-primary-button" onClick={openCreate} type="button">
              <Plus size={17} /> Add content
            </button>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {isEditorOpen && (
            <section className="admin-food-editor" aria-labelledby="food-editor-title">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-kicker">Dining details</span>
                  <h2 id="food-editor-title">{editingId ? 'Edit content' : 'Add dining content'}</h2>
                </div>
                <button aria-label="Close food form" className="admin-icon-button" onClick={closeEditor} type="button"><X size={18} /></button>
              </div>
              <form className="admin-food-form" onSubmit={saveFoodItem}>
                <label>
                  Title
                  <input autoFocus maxLength="120" onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} />
                </label>
                <label>
                  Image URL
                  <input onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://…" type="url" value={form.imageUrl} />
                </label>
                <label className="admin-room-wide">
                  Description
                  <textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows="4" value={form.description} />
                </label>
                <label className="admin-food-active">
                  <input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />
                  Visible on public site
                </label>
                <div className="admin-food-actions">
                  <button className="admin-secondary-button" onClick={closeEditor} type="button">Cancel</button>
                  <button className="admin-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create content'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="admin-food-list" aria-label="Food and dining content">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">Property content</span>
                <h2>Dining entries</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${items.length} total`}</span>
            </div>
            <div className="admin-gallery-preview">
              {!isLoading && items.map((item) => (
                <article className="admin-gallery-item" key={item._id}>
                  {item.imageUrl
                    ? <img alt={item.title} className="admin-food-image" loading="lazy" src={item.imageUrl} />
                    : <div className="admin-food-image-placeholder"><UtensilsCrossed size={26} /></div>}
                  <div className="admin-food-card-body">
                    <div className="admin-gallery-meta">
                      <h3>{item.title}</h3>
                      <span className={`admin-status ${item.isActive ? 'is-active' : 'is-inactive'}`}>{item.isActive ? 'Visible' : 'Hidden'}</span>
                    </div>
                    <p>{item.description || 'No description added.'}</p>
                    <div className="admin-gallery-card-actions">
                      <button aria-label={`Edit ${item.title}`} className="admin-icon-button" onClick={() => openEdit(item)} type="button"><Pencil size={16} /></button>
                      <button aria-label={`${item.isActive ? 'Hide' : 'Show'} ${item.title}`} className="admin-icon-button" disabled={updatingId === item._id} onClick={() => toggleVisibility(item)} type="button">
                        {item.isActive ? <X size={16} /> : <Plus size={16} />}
                      </button>
                      <button aria-label={`Delete ${item.title}`} className="admin-icon-button is-danger" onClick={() => deleteFoodItem(item)} type="button"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </article>
              ))}
              {!isLoading && items.length === 0 && <div className="admin-gallery-empty">No dining content yet. Add an entry to get started.</div>}
              {isLoading && <div className="admin-gallery-empty">Loading dining content…</div>}
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminFood