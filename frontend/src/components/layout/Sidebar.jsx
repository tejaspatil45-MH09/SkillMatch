import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { NAV } from '../../utils/constants'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'

export default function Sidebar({ onNavigate }) {
  const { user } = useAuth()
  const { unread } = useNotifications()
  return (
    <nav aria-label="Main" className="flex flex-col gap-1 p-3">
      {NAV[user.role].map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} onClick={onNavigate}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2.5 font-medium transition-colors',
            isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100')}>
          <Icon className="size-4.5" aria-hidden />{label}{to === '/notifications' && unread > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </NavLink>
      ))}
    </nav>
  )
}
