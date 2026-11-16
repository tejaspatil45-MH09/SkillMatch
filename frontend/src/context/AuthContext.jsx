import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authService } from '../services/authService'

// status: 'loading' (restoring session) | 'authenticated' | 'unauthenticated'
// Role checks built on this are UI conveniences only; the backend enforces real authorization.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, status: 'loading' })

  // Restore the session the same way the real app will: GET /api/auth/me
  useEffect(() => {
    let alive = true
    authService.getCurrentUser().then(
      (user) => alive && setState({ user, status: 'authenticated' }),
      () => alive && setState({ user: null, status: 'unauthenticated' }))
    return () => { alive = false }
  }, [])

  const login = useCallback(async (credentials) => {
    const { user } = await authService.login(credentials)
    setState({ user, status: 'authenticated' }); return user
  }, [])
  const register = useCallback(async (data) => {
    const { user } = await authService.register(data)
    setState({ user, status: 'authenticated' }); return user
  }, [])
  const logout = useCallback(async () => {
    try { await authService.logout() } finally { setState({ user: null, status: 'unauthenticated' }) }
  }, [])

  // Re-fetch the current user (e.g. after a profile edit changes the name)
  const refresh = useCallback(async () => { const user = await authService.getCurrentUser(); setState({ user, status: 'authenticated' }) }, [])

  const value = useMemo(() => ({ ...state, login, register, logout, refresh }), [state, login, register, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export const useAuth = () => useContext(AuthContext)
