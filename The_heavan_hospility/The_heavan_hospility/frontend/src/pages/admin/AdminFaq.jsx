import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const emptyFaq = { question: '', answer: '', isActive: true }

function fetchFaqs() {
  return api.get('/faqs').then((response) => response.data?.data || [])
}

function AdminFaq() {
  const navigate = useNavigate()
  const [faqs, setFaqs] = useState([])
  const [form, setForm] = useState(emptyFaq)
  const [editingId, setEditingId] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isActive = true

    fetchFaqs()
      .then((data) => {
        if (isActive) setFaqs(data)
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load FAQs.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  async function loadFaqs() {
    setIsLoading(true)
    setError('')
    try {
      setFaqs(await fetchFaqs())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load FAQs.')
    } finally {
      setIsLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyFaq)
    setEditingId('')
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function openEdit(faq) {
    setForm({ question: faq.question || '', answer: faq.answer || '', isActive: faq.isActive !== false })
    setEditingId(faq._id)
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    setEditingId('')
    setForm(emptyFaq)
  }

  async function saveFaq(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      const payload = { question: form.question.trim(), answer: form.answer.trim(), isActive: form.isActive }
      const config = { headers: { Authorization: `Bearer ${token}` } }

      if (editingId) {
        await api.patch(`/faqs/${editingId}`, payload, config)
        setNotice('FAQ updated.')
      } else {
        await api.post('/faqs', payload, config)
        setNotice('FAQ added.')
      }

      closeEditor()
      await loadFaqs()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save this FAQ.')
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleActive(faq) {
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/faqs/${faq._id}`, { isActive: !faq.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setFaqs((current) => current.map((item) => (item._id === faq._id ? { ...item, ...updated } : item)))
      setNotice(`FAQ ${updated?.isActive ? 'activated' : 'deactivated'}.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update this FAQ.')
    }
  }

  async function deleteFaq(faq) {
    if (!window.confirm(`Delete "${faq.question}"? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/faqs/${faq._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setFaqs((current) => current.filter((item) => item._id !== faq._id))
      setNotice('FAQ deleted.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this FAQ.')
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
        <Link className="admin-side-current" to="/admin/faq"><HelpCircle size={16} /> FAQ</Link>
        <Link className="admin-side-link" to="/admin/offers"><Tag size={16} /> Special offer</Link>
        <Link className="admin-side-link" to="/admin/settings"><Settings2 size={16} /> Website settings</Link>
        <a className="admin-side-public" href="/">View public website <ArrowUpRight size={15} /></a>
        <button className="admin-logout" onClick={handleLogout} type="button">
          <LogOut size={17} /> Sign out
        </button>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <span>Management / FAQ</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadFaqs} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Common questions</span>
              <h1>FAQ</h1>
              <p>Manage the questions and answers shown on the public website.</p>
            </div>
            <button className="admin-primary-button" onClick={openCreate} type="button">
              <Plus size={17} /> Add FAQ
            </button>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {isEditorOpen && (
            <section className="admin-amenity-editor" aria-labelledby="faq-editor-title">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-kicker">FAQ details</span>
                  <h2 id="faq-editor-title">{editingId ? 'Edit FAQ' : 'Add an FAQ'}</h2>
                </div>
                <button aria-label="Close FAQ form" className="admin-icon-button" onClick={closeEditor} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="admin-amenity-form" onSubmit={saveFaq}>
                <label className="admin-room-wide">
                  Question
                  <input autoFocus maxLength="200" onChange={(event) => setForm({ ...form, question: event.target.value })} required value={form.question} />
                </label>
                <label className="admin-room-wide">
                  Answer
                  <textarea maxLength="1000" onChange={(event) => setForm({ ...form, answer: event.target.value })} required rows="4" value={form.answer} />
                </label>
                <label className="admin-amenity-active">
                  <input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />
                  Active
                </label>
                <div className="admin-amenity-actions">
                  <button className="admin-secondary-button" onClick={closeEditor} type="button">Cancel</button>
                  <button className="admin-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Create FAQ'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="admin-amenity-list" aria-label="FAQ list">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">Public website</span>
                <h2>All FAQs</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${faqs.length} total`}</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Question</th><th>Answer</th><th>Status</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && faqs.map((faq) => (
                    <tr key={faq._id}>
                      <td><strong>{faq.question}</strong></td>
                      <td className="admin-review-copy">{faq.answer}</td>
                      <td>
                        <button
                          aria-label={`${faq.isActive ? 'Deactivate' : 'Activate'} "${faq.question}"`}
                          className={`admin-status ${faq.isActive ? 'is-active' : 'is-inactive'}`}
                          onClick={() => toggleActive(faq)}
                          style={{ cursor: 'pointer', border: 'none' }}
                          type="button"
                        >{faq.isActive ? 'Active' : 'Inactive'}</button>
                      </td>
                      <td className="admin-amenity-actions">
                        <button aria-label={`Edit "${faq.question}"`} className="admin-icon-button" onClick={() => openEdit(faq)} type="button"><Pencil size={16} /></button>
                        <button aria-label={`Delete "${faq.question}"`} className="admin-icon-button is-danger" onClick={() => deleteFaq(faq)} type="button"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && faqs.length === 0 && (
                    <tr><td className="admin-empty" colSpan="4">No FAQs yet. Add the first question and answer.</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="4">Loading FAQs…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminFaq
