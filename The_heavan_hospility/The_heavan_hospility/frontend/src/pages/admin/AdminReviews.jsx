import { useEffect, useState } from 'react'
import { ArrowUpRight, BedDouble, Check, ClipboardList, Eye, EyeOff, HelpCircle, Images, LogOut, MessageSquareQuote, RefreshCw, Settings2, Sparkles, Tag, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

function fetchReviews(token) {
  return api.get('/reviews/admin', {
    headers: { Authorization: `Bearer ${token}` },
  }).then((response) => response.data?.data || [])
}

function AdminReviews() {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState([])
  const [filter, setFilter] = useState('All reviews')
  const [updatingId, setUpdatingId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let isActive = true
    const token = window.localStorage.getItem('adminToken')

    fetchReviews(token)
      .then((data) => {
        if (isActive) setReviews(data)
      })
      .catch((requestError) => {
        if (!isActive) return
        if (requestError.response?.status === 401) {
          window.localStorage.removeItem('adminToken')
          navigate('/admin/login', { replace: true })
          return
        }
        setError(requestError.response?.data?.message || 'Could not load reviews.')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })

    return () => { isActive = false }
  }, [navigate])

  async function loadReviews() {
    setIsLoading(true)
    setError('')
    try {
      const token = window.localStorage.getItem('adminToken')
      setReviews(await fetchReviews(token))
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not load reviews.')
    } finally {
      setIsLoading(false)
    }
  }

  async function updateReview(review, changes) {
    setUpdatingId(review._id)
    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      const response = await api.patch(`/reviews/${review._id}`, changes, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const updated = response.data?.data
      setReviews((current) => current.map((item) => (
        item._id === review._id ? { ...item, ...changes, ...updated } : item
      )))
      setNotice(`Review from ${review.name} updated.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not update this review.')
    } finally {
      setUpdatingId('')
    }
  }

  async function deleteReview(review) {
    if (!window.confirm(`Delete the review from ${review.name}? This cannot be undone.`)) return

    setError('')
    setNotice('')
    try {
      const token = window.localStorage.getItem('adminToken')
      await api.delete(`/reviews/${review._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      setReviews((current) => current.filter((item) => item._id !== review._id))
      setNotice(`Review from ${review.name} deleted.`)
    } catch (requestError) {
      if (requestError.response?.status === 401) {
        window.localStorage.removeItem('adminToken')
        navigate('/admin/login', { replace: true })
        return
      }
      setError(requestError.response?.data?.message || 'Could not delete this review.')
    }
  }

  function handleLogout() {
    window.localStorage.removeItem('adminToken')
    navigate('/admin/login', { replace: true })
  }

  const visibleReviews = reviews.filter((review) => {
    if (filter === 'Pending approval') return !review.isApproved
    if (filter === 'Approved') return review.isApproved
    return true
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
        <Link className="admin-side-link" to="/admin/enquiries"><ClipboardList size={16} /> Enquiries</Link>
        <Link className="admin-side-current" to="/admin/reviews"><MessageSquareQuote size={16} /> Reviews</Link>
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
          <span>Management / Reviews</span>
          <button className="admin-refresh" disabled={isLoading} onClick={loadReviews} type="button">
            <RefreshCw size={16} /> Refresh
          </button>
        </header>

        <div className="admin-content">
          <div className="admin-page-heading">
            <div>
              <span className="admin-kicker">Guest feedback</span>
              <h1>Reviews</h1>
              <p>Approve testimonials and control which ones appear publicly.</p>
            </div>
            <span className="admin-table-count">{isLoading ? 'Loading' : `${visibleReviews.length} of ${reviews.length}`}</span>
          </div>

          {error && <div className="admin-alert" role="alert">{error}</div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}

          <div className="admin-enquiry-tools admin-review-tools">
            <select aria-label="Filter reviews" onChange={(event) => setFilter(event.target.value)} value={filter}>
              <option>All reviews</option>
              <option>Pending approval</option>
              <option>Approved</option>
            </select>
          </div>

          <section className="admin-room-list" aria-label="Review moderation">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr><th>Guest</th><th>Review</th><th>Rating</th><th>Received</th><th>Approval</th><th>Visibility</th><th aria-label="Actions" /></tr>
                </thead>
                <tbody>
                  {!isLoading && visibleReviews.map((review) => (
                    <tr key={review._id}>
                      <td><strong>{review.name}</strong></td>
                      <td className="admin-review-copy">{review.review}</td>
                      <td><span className="admin-review-rating">{review.rating} / 5</span></td>
                      <td>{new Date(review.createdAt).toLocaleDateString()}</td>
                      <td><span className={`admin-review-state ${review.isApproved ? 'is-approved' : ''}`}>{review.isApproved ? 'Approved' : 'Pending'}</span></td>
                      <td><span className={`admin-review-state ${review.isVisible ? 'is-visible' : ''}`}>{review.isVisible ? 'Visible' : 'Hidden'}</span></td>
                      <td className="admin-review-actions">
                        <button
                          aria-label={`${review.isApproved ? 'Unapprove' : 'Approve'} review from ${review.name}`}
                          className="admin-icon-button"
                          disabled={updatingId === review._id}
                          onClick={() => updateReview(review, { isApproved: !review.isApproved })}
                          title={review.isApproved ? 'Unapprove review' : 'Approve review'}
                          type="button"
                        >{review.isApproved ? <X size={16} /> : <Check size={16} />}</button>
                        <button
                          aria-label={`${review.isVisible ? 'Hide' : 'Show'} review from ${review.name}`}
                          className="admin-icon-button"
                          disabled={updatingId === review._id}
                          onClick={() => updateReview(review, { isVisible: !review.isVisible })}
                          title={review.isVisible ? 'Hide review' : 'Show review'}
                          type="button"
                        >{review.isVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                        <button
                          aria-label={`Delete review from ${review.name}`}
                          className="admin-icon-button is-danger"
                          onClick={() => deleteReview(review)}
                          title="Delete review"
                          type="button"
                        ><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {!isLoading && visibleReviews.length === 0 && (
                    <tr><td className="admin-empty" colSpan="7">{reviews.length ? 'No reviews match this filter.' : 'No reviews submitted yet.'}</td></tr>
                  )}
                  {isLoading && <tr><td className="admin-empty" colSpan="7">Loading reviews…</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}

export default AdminReviews