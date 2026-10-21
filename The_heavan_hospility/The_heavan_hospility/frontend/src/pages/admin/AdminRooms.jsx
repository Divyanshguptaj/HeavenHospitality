import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, ClipboardList, HelpCircle, Images, LogOut, MessageSquareQuote, Pencil, Plus, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

const SHARING_TYPES = ['Single Sharing', '2 Sharing', '3 Sharing', '4 Sharing', '5 Sharing', '6 Sharing']
const AC_TYPES = ['AC', 'Non-AC', 'Both']
const AVAILABILITY_STATUSES = ['Available', 'Limited', 'Full', 'On Request']

const emptyRoom = {
  name: '',
  sharingType: SHARING_TYPES[1],
  description: '',
  monthlyRent: '',
  acType: AC_TYPES[1],
  totalCapacity: '',
  vacantBeds: '',
  tag: '',
  availabilityStatus: AVAILABILITY_STATUSES[0],
  amenitiesText: '',
  imagesText: '',
  isActive: true,
}

function getRoomForm(room) {
  return {
    name: room.name || '',
    sharingType: room.sharingType || SHARING_TYPES[1],
    description: room.description || '',
    monthlyRent: room.monthlyRent ?? '',
    acType: room.acType || AC_TYPES[1],
    totalCapacity: room.totalCapacity ?? '',
    vacantBeds: room.vacantBeds ?? '',
    tag: room.tag || '',
    availabilityStatus: room.availabilityStatus || AVAILABILITY_STATUSES[0],
    amenitiesText: (room.amenities || []).join(', '),
    imagesText: (room.images || []).join('\n'),
    isActive: room.isActive !== false,
  }
}

function getRoomPayload(form) {
  return {
    name: form.name.trim(),
    sharingType: form.sharingType,
    description: form.description.trim(),
    monthlyRent: Number(form.monthlyRent) || 0,
    acType: form.acType,
    totalCapacity: Number(form.totalCapacity) || 1,
    vacantBeds: Number(form.vacantBeds) || 0,
    tag: form.tag.trim(),
    availabilityStatus: form.availabilityStatus,
    amenities: form.amenitiesText.split(',').map((item) => item.trim()).filter(Boolean),
    images: form.imagesText.split('\n').map((item) => item.trim()).filter(Boolean),
    isActive: form.isActive,
  }
}

function formatRent(value) {
  if (!value && value !== 0) return '—'
  return `₹${Number(value).toLocaleString('en-IN')}`
}

function fetchRooms() {
  return api.get('/rooms').then((response) => response.data?.data || [])
}

function AdminRooms() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [form, setForm] = useState(emptyRoom)
  const [editingRoom, setEditingRoom] = useState(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadRooms = useCallback(async () => {
    try {
      setRooms(await fetchRooms())
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load rooms from the backend.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let isActive = true

    fetchRooms()
      .then((data) => {
        if (isActive) setRooms(data)
      })
      .catch((requestError) => {
        if (isActive) setError(requestError.response?.data?.message || 'Could not load rooms from the backend.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [])

  function startCreate() {
    setEditingRoom(null)
    setForm(emptyRoom)
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function startEdit(room) {
    setEditingRoom(room)
    setForm(getRoomForm(room))
    setError('')
    setNotice('')
    setIsEditorOpen(true)
  }

  function closeEditor() {
    setIsEditorOpen(false)
    setEditingRoom(null)
    setForm(emptyRoom)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (Number(form.vacantBeds) > Number(form.totalCapacity)) {
      setError('Vacant beds cannot exceed total capacity.')
      return
    }

    setIsSaving(true)
    setError('')
    setNotice('')
    const token = window.localStorage.getItem('adminToken')
    const config = { headers: { Authorization: `Bearer ${token}` } }

    try {
      if (editingRoom) {
        await api.patch(`/rooms/${editingRoom._id}`, getRoomPayload(form), config)
        setNotice('Room updated.')
      } else {
        await api.post('/rooms', getRoomPayload(form), config)
        setNotice('Room added.')
      }
      closeEditor()
      await loadRooms()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not save this room.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(room) {
    if (!window.confirm(`Delete ${room.name}? This cannot be undone.`)) return

    const token = window.localStorage.getItem('adminToken')
    try {
      await api.delete(`/rooms/${room._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setNotice(`${room.name} deleted.`)
      await loadRooms()
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this room.')
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
  }

  function handleRefresh() {
    setIsLoading(true)
    setError('')
    loadRooms()
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
        <Link className="admin-side-current" to="/admin/rooms"><BedDouble size={16} /> Rooms</Link>
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
          <span>Management / Rooms</span>
          <button className="admin-refresh" disabled={isLoading} onClick={handleRefresh} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Inventory</span>
              <h1>Rooms</h1>
              <p>Manage room rent, AC/Non-AC inventory, and bed availability.</p>
            </div>
            <button className="admin-primary-button" onClick={startCreate} type="button">
              <Plus size={17} /> Add room
            </button>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {isEditorOpen && (
            <section className="admin-room-editor" aria-labelledby="room-editor-title">
              <div className="admin-section-heading">
                <div>
                  <span className="admin-kicker">Room details</span>
                  <h2 id="room-editor-title">{editingRoom ? 'Edit room' : 'Add a room'}</h2>
                </div>
                <button className="admin-icon-button" aria-label="Close room form" onClick={closeEditor} type="button">
                  <X size={18} />
                </button>
              </div>
              <form className="admin-room-form" onSubmit={handleSubmit}>
                <label>
                  Room name
                  <input autoFocus maxLength="100" onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} />
                </label>
                <label>
                  Sharing type
                  <select onChange={(event) => setForm({ ...form, sharingType: event.target.value })} required value={form.sharingType}>
                    {SHARING_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  Monthly rent (₹)
                  <input min="0" onChange={(event) => setForm({ ...form, monthlyRent: event.target.value })} required type="number" value={form.monthlyRent} />
                </label>
                <label>
                  AC / Non-AC
                  <select onChange={(event) => setForm({ ...form, acType: event.target.value })} required value={form.acType}>
                    {AC_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label>
                  Total capacity (beds)
                  <input min="1" onChange={(event) => setForm({ ...form, totalCapacity: event.target.value })} required type="number" value={form.totalCapacity} />
                </label>
                <label>
                  Vacant beds
                  <input min="0" onChange={(event) => setForm({ ...form, vacantBeds: event.target.value })} required type="number" value={form.vacantBeds} />
                </label>
                <label>
                  Availability status
                  <select onChange={(event) => setForm({ ...form, availabilityStatus: event.target.value })} value={form.availabilityStatus}>
                    {AVAILABILITY_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <label>
                  Tag <span>Optional, e.g. "Popular"</span>
                  <input maxLength="40" onChange={(event) => setForm({ ...form, tag: event.target.value })} value={form.tag} />
                </label>
                <label className="admin-room-wide">
                  Description
                  <textarea onChange={(event) => setForm({ ...form, description: event.target.value })} rows="3" value={form.description} />
                </label>
                <label>
                  Amenities <span>Separate with commas</span>
                  <textarea onChange={(event) => setForm({ ...form, amenitiesText: event.target.value })} rows="3" value={form.amenitiesText} />
                </label>
                <label>
                  Image URLs <span>One URL per line</span>
                  <textarea onChange={(event) => setForm({ ...form, imagesText: event.target.value })} rows="3" value={form.imagesText} />
                </label>
                <label className="admin-room-active">
                  <input checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} type="checkbox" />
                  Visible on public site
                </label>
                <div className="admin-room-form-actions">
                  <button className="admin-secondary-button" onClick={closeEditor} type="button">Cancel</button>
                  <button className="admin-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Saving…' : editingRoom ? 'Save changes' : 'Create room'}
                  </button>
                </div>
              </form>
            </section>
          )}

          <section className="admin-room-list" aria-label="Room inventory">
            <div className="admin-section-heading">
              <div>
                <span className="admin-kicker">Property inventory</span>
                <h2>All rooms</h2>
              </div>
              <span className="admin-table-count">{isLoading ? 'Loading' : `${rooms.length} total`}</span>
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Room</th><th>Sharing</th><th>Rent</th><th>AC</th><th>Beds</th><th>Status</th><th>Visibility</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && rooms.map((room) => (
                    <tr key={room._id}>
                      <td><strong>{room.name}</strong>{room.tag && <small>{room.tag}</small>}</td>
                      <td>{room.sharingType}</td>
                      <td>{formatRent(room.monthlyRent)}</td>
                      <td>{room.acType}</td>
                      <td>{room.vacantBeds} / {room.totalCapacity}</td>
                      <td>{room.availabilityStatus}</td>
                      <td><span className={`admin-status ${room.isActive ? 'is-active' : 'is-inactive'}`}>{room.isActive ? 'Visible' : 'Hidden'}</span></td>
                      <td className="admin-room-actions">
                        <button aria-label={`Edit ${room.name}`} className="admin-icon-button" onClick={() => startEdit(room)} type="button"><Pencil size={16} /></button>
                        <button aria-label={`Delete ${room.name}`} className="admin-icon-button is-danger" onClick={() => handleDelete(room)} type="button"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && rooms.length === 0 && (
                    <tr><td className="admin-empty" colSpan="8">No rooms yet. Add the first one to start your inventory.</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="8">Loading rooms…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminRooms
