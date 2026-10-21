import { useState } from 'react'
import { ArrowRight, KeyRound } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import './admin.css'

function AdminLogin() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (window.localStorage.getItem('adminToken')) {
    return <Navigate to="/admin" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await api.post('/auth/login', { email, password })
      const token = response.data?.data?.token

      if (!token) {
        throw new Error('The server did not return an access token.')
      }

      window.localStorage.setItem('adminToken', token)
      navigate('/admin', { replace: true })
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
          requestError.message ||
          'Unable to sign in. Check your details and try again.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="admin-login-page">
      <Link className="admin-back-link" to="/">
        The Heaven Hospitality
      </Link>
      <section className="admin-login-panel" aria-labelledby="admin-login-title">
        <span className="admin-kicker">Management portal</span>
        <h1 id="admin-login-title">Welcome back.</h1>
        <p>Sign in to manage rooms, enquiries, and your property content.</p>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email address</label>
          <input
            autoComplete="username"
            id="admin-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />

          <label htmlFor="admin-password">Password</label>
          <input
            autoComplete="current-password"
            id="admin-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {error && <p className="admin-form-error" role="alert">{error}</p>}

          <button className="admin-submit" disabled={isSubmitting} type="submit">
            <KeyRound aria-hidden="true" size={17} />
            {isSubmitting ? 'Signing in…' : 'Sign in'}
            {!isSubmitting && <ArrowRight aria-hidden="true" size={17} />}
          </button>
        </form>
      </section>
    </main>
  )
}

export default AdminLogin