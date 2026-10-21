import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpRight, BedDouble, ClipboardList, Eye, EyeOff, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, Upload, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const emptyEdit = { title: '', category: '' }

function fetchGallery() {
  return api.get('/gallery').then((response) => response.data?.data || [])
}

function AdminGallery() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('General')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const previewUrlRef = useRef('')
  const [editingId, setEditingId] = useState('')
  const [editForm, setEditForm] = useState(emptyEdit)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isActive = true

    fetchGallery()
      .then((data) => {
        if (isActive) setItems(data)
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load gallery images.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }, [])

  async function loadGallery() {
    setIsLoading(true)
    setError('')
    try {
      setItems(await fetchGallery())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load gallery images.')
    } finally {
      setIsLoading(false)
    }
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0] || null
    setError('')
    if (selected && !selected.type.startsWith('image/')) {
      setFile(null)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
      setPreviewUrl('')
      setError('Choose an image file.')
      return
    }
    if (selected && selected.size > 5 * 1024 * 1024) {
      setFile(null)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
      setPreviewUrl('')
      setError('Images must be 5 MB or smaller.')
      return
    }
    setFile(selected)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = selected ? URL.createObjectURL(selected) : ''
    setPreviewUrl(previewUrlRef.current)
  }

  async function uploadImage(event) {
    event.preventDefault()
    if (!file) {
      setError('Choose an image to upload.')
      return
    }

    setIsUploading(true)
    setError('')
    setNotice('')
    const body = new FormData()
    body.append('image', file)
    body.append('title', title.trim())
    body.append('category', category.trim() || 'General')

    try {
      const token = window.localStorage.getItem('adminToken')
      await api.post('/gallery', body, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setFile(null)
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = ''
      setPreviewUrl('')
      setTitle('')
      setCategory('General')
      setNotice('Image uploaded to the gallery.')
      await loadGallery()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not upload this image. Check Cloudinary configuration.')
    } finally {
      setIsUploading(false)
    }
  }

  async function saveDetails(item) {
    setUpdatingId(item._id)
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/gallery/${item._id}`, {
        title: editForm.title.trim(),
        category: editForm.category.trim() || 'General',
      }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...updated } : entry))
      setEditingId('')
      setNotice('Gallery details updated.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update this image.')
    } finally {
      setUpdatingId('')
    }
  }

  async function toggleVisibility(item) {
    setUpdatingId(item._id)
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/gallery/${item._id}`, { isActive: !item.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setItems((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...updated } : entry))
      setNotice(`Image ${updated?.isActive ? 'shown' : 'hidden'} on the public site.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update image visibility.')
    } finally {
      setUpdatingId('')
    }
  }

  async function moveItem(index, direction) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= items.length) return

    const reordered = [...items]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(newIndex, 0, moved)
    setItems(reordered)
    setError('')
    setNotice('')

    try {
      const token = window.localStorage.getItem('adminToken')
      await api.patch('/gallery/reorder', { order: reordered.map((entry) => entry._id) }, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not reorder images.')
      await loadGallery()
    }
  }

  async function deleteImage(item) {
    if (!window.confirm('Delete this gallery image? This cannot be undone.')) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/gallery/${item._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setItems((current) => current.filter((entry) => entry._id !== item._id))
      setNotice('Gallery image deleted.')
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this image.')
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
        <Link className="admin-side-current" to="/admin/gallery"><Images size={16} /> Gallery</Link>
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
          <span>Management / Gallery</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadGallery} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Property imagery</span>
              <h1>Gallery</h1>
              <p>Upload and organize images for the property gallery.</p>
            </div>
            <span className="admin-table-count">{isLoading ? 'Loading' : `${items.length} images`}</span>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          <form className="admin-gallery-upload" onSubmit={uploadImage}>
            <label>
              Image title
              <input maxLength="120" onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Shared dining area" value={title} />
            </label>
            <label>
              Category
              <input maxLength="80" onChange={(event) => setCategory(event.target.value)} value={category} />
            </label>
            <label>
              Image file
              <input accept="image/*" onChange={chooseFile} required={!file} type="file" />
            </label>
            <button className="admin-primary-button" disabled={isUploading} type="submit">
              <Upload size={16} /> {isUploading ? 'Uploading…' : 'Upload image'}
            </button>
          </form>

          {previewUrl && (
            <div className="admin-gallery-preview" aria-label="Selected image preview">
              <article className="admin-gallery-item">
                <img alt="Selected upload preview" className="admin-gallery-image" src={previewUrl} />
                <div className="admin-gallery-info"><strong>{title || file?.name}</strong><span>{category || 'General'} · ready to upload</span></div>
              </article>
            </div>
          )}

          <div className="admin-gallery-preview" aria-label="Gallery images">
            {!isLoading && items.map((item, index) => (
              <article className="admin-gallery-item" key={item._id}>
                <img alt={item.title || item.category || 'Property gallery image'} className="admin-gallery-image" loading="lazy" src={item.imageUrl} />
                <div className="admin-gallery-info">
                  {editingId === item._id ? (
                    <div className="admin-gallery-edit">
                      <input aria-label="Image title" maxLength="120" onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} value={editForm.title} />
                      <input aria-label="Image category" maxLength="80" onChange={(event) => setEditForm({ ...editForm, category: event.target.value })} value={editForm.category} />
                      <div className="admin-gallery-card-actions">
                        <button aria-label="Cancel edit" className="admin-icon-button" onClick={() => setEditingId('')} type="button"><X size={16} /></button>
                        <button aria-label="Save image details" className="admin-icon-button" disabled={updatingId === item._id} onClick={() => saveDetails(item)} type="button"><Plus size={16} /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <strong title={item.title}>{item.title || 'Untitled image'}</strong>
                      <div className="admin-gallery-meta">
                        <span>{item.category || 'General'}</span>
                        <span className={`admin-status ${item.isActive ? 'is-active' : 'is-inactive'}`}>{item.isActive ? 'Visible' : 'Hidden'}</span>
                      </div>
                      <div className="admin-gallery-card-actions">
                        <button
                          aria-label={`Move ${item.title || 'image'} earlier`}
                          className="admin-icon-button"
                          disabled={index === 0}
                          onClick={() => moveItem(index, -1)}
                          type="button"
                        ><ArrowUp size={16} /></button>
                        <button
                          aria-label={`Move ${item.title || 'image'} later`}
                          className="admin-icon-button"
                          disabled={index === items.length - 1}
                          onClick={() => moveItem(index, 1)}
                          type="button"
                        ><ArrowDown size={16} /></button>
                        <button
                          aria-label={`Edit ${item.title || 'image'} details`}
                          className="admin-icon-button"
                          onClick={() => { setEditingId(item._id); setEditForm({ title: item.title || '', category: item.category || 'General' }) }}
                          type="button"
                        ><Pencil size={16} /></button>
                        <button
                          aria-label={`${item.isActive ? 'Hide' : 'Show'} ${item.title || 'image'}`}
                          className="admin-icon-button"
                          disabled={updatingId === item._id}
                          onClick={() => toggleVisibility(item)}
                          type="button"
                        >{item.isActive ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                        <button aria-label={`Delete ${item.title || 'image'}`} className="admin-icon-button is-danger" onClick={() => deleteImage(item)} type="button"><Trash2 size={16} /></button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}
            {!isLoading && items.length === 0 && !previewUrl && (
              <div className="admin-gallery-empty">No gallery images yet. Upload an image to get started.</div>
            )}
            {isLoading && <div className="admin-gallery-empty">Loading gallery…</div>}
          </div>
        </div>
      </section>
    </main>
  )
}

export default AdminGallery