import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Bell, LogOut, Menu, RotateCcw, User } from 'lucide-react'
import Logo from './Logo'
import Avatar from '../ui/Avatar'
import Dropdown, { DropdownItem } from '../ui/Dropdown'
import ConfirmDialog from '../ui/ConfirmDialog'
import { adminService } from '../../services/adminService'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { useNotifications } from '../../context/NotificationContext'
import { ROLE_HOME } from '../../utils/constants'

export default function Navbar({ onMenu }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { unread } = useNotifications()
  const toast = useToast()
  const [resetting, setResetting] = useState(false)
  async function resetDemo() {
    try { await adminService.resetDemoData(); await logout(); setResetting(false); navigate('/login'); toast('Demo data has been reset.') }
    catch (e) { toast(e.message, 'error'); setResetting(false) }
  }
  const profilePath = { FREELANCER: '/freelancer/profile', COMPANY: '/company/profile' }[user.role]
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} aria-label="Open navigation" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="size-5" /></button>
        <Logo to={ROLE_HOME[user.role]} />
      </div>
      <div className="flex items-center gap-2">
        <Link to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100">
          <Bell className="size-5" />
          {unread > 0 && <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
        </Link>
        <Dropdown trigger={<Avatar name={user.name} size="sm" />}>
          <div className="px-3 py-2"><p className="font-medium text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.role.toLowerCase()}</p></div>
          {profilePath && <DropdownItem icon={User} onClick={() => navigate(profilePath)}>Profile</DropdownItem>}
          {import.meta.env.VITE_USE_MOCK !== 'false' && <DropdownItem icon={RotateCcw} onClick={() => setResetting(true)}>Reset demo data</DropdownItem>}
          <DropdownItem icon={LogOut} onClick={async () => { await logout(); navigate('/login') }}>Log out</DropdownItem>
        </Dropdown>
      </div>
      <ConfirmDialog open={resetting} danger onClose={() => setResetting(false)} onConfirm={resetDemo} title="Reset demo data?" confirmLabel="Reset" message="All sample projects, proposals, hirings and any changes you made will be restored to the original demo data, and you will be signed out." />
    </header>
  )
}
