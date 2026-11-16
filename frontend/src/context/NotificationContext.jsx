import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { notificationService } from '../services/notificationService'

// Keeps the navbar/sidebar unread badge in sync. Real-time push can replace polling later.
const NotificationContext = createContext({ unread: 0, refresh: () => {} })

export function NotificationProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id
  const [unread, setUnread] = useState(0)
  const refresh = useCallback(async () => {
    if (!uid) return setUnread(0)
    try { setUnread((await notificationService.getNotifications()).filter((n) => !n.read).length) } catch { /* badge is non-critical */ }
  }, [uid])
  useEffect(() => {
    refresh()
    if (!uid) return
    const id = setInterval(refresh, 60000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('focus', refresh) }
  }, [refresh, uid])
  const value = useMemo(() => ({ unread, refresh }), [unread, refresh])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
export const useNotifications = () => useContext(NotificationContext)
