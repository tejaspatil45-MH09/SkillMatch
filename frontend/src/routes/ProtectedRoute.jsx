import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { ROLE_HOME } from '../utils/constants'

// UI convenience only. Real authorization is enforced by the backend.
export default function ProtectedRoute({ roles }) {
  const { user, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <div className="min-h-screen"><LoadingSpinner label="Loading your workspace" /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}

// Keeps signed-in users away from /login and /register
export function GuestRoute() {
  const { user, status } = useAuth()
  if (status === 'loading') return <div className="min-h-screen"><LoadingSpinner /></div>
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}
