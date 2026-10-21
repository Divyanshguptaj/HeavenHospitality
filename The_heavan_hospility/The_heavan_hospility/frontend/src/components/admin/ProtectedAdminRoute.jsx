import { Navigate } from 'react-router-dom'

function ProtectedAdminRoute({ children }) {
  const token = window.localStorage.getItem('adminToken')

  return token ? children : <Navigate to="/admin/login" replace />
}

export default ProtectedAdminRoute