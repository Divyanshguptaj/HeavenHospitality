import { Routes, Route } from 'react-router-dom'
import Home from '../pages/Home'
import RoomDetailsPage from '../pages/RoomDetailsPage'
import NotFound from '../pages/NotFound'
import AdminLogin from '../pages/admin/AdminLogin'
import AdminDashboard from '../pages/admin/AdminDashboard'
import AdminRooms from '../pages/admin/AdminRooms'
import AdminEnquiries from '../pages/admin/AdminEnquiries'
import AdminReviews from '../pages/admin/AdminReviews'
import AdminAmenities from '../pages/admin/AdminAmenities'
import AdminGallery from '../pages/admin/AdminGallery'
import AdminFood from '../pages/admin/AdminFood'
import AdminFaq from '../pages/admin/AdminFaq'
import AdminOffers from '../pages/admin/AdminOffers'
import AdminSettings from '../pages/admin/AdminSettings'
import ProtectedAdminRoute from '../components/admin/ProtectedAdminRoute'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/rooms/:id" element={<RoomDetailsPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminDashboard />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/rooms"
        element={
          <ProtectedAdminRoute>
            <AdminRooms />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/enquiries"
        element={
          <ProtectedAdminRoute>
            <AdminEnquiries />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/reviews"
        element={
          <ProtectedAdminRoute>
            <AdminReviews />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/amenities"
        element={
          <ProtectedAdminRoute>
            <AdminAmenities />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/gallery"
        element={
          <ProtectedAdminRoute>
            <AdminGallery />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/food"
        element={
          <ProtectedAdminRoute>
            <AdminFood />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/faq"
        element={
          <ProtectedAdminRoute>
            <AdminFaq />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/offers"
        element={
          <ProtectedAdminRoute>
            <AdminOffers />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedAdminRoute>
            <AdminSettings />
          </ProtectedAdminRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default AppRoutes
