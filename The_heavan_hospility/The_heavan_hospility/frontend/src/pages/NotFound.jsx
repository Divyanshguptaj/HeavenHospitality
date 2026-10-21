import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 text-center">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#8d5c2c]">404</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-3 text-slate-600">The page you are looking for does not exist or has been moved.</p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-full bg-[#c98a4b] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#b77c3f]"
        >
          Back to home
        </Link>
      </div>
    </main>
  )
}

export default NotFound
