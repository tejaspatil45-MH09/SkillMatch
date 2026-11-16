import { LayoutDashboard, Search, FileText, Handshake, User, Bell, FolderKanban, Inbox, Building2, Users, Flag, Tags, Percent } from 'lucide-react'

export const ROLES = { FREELANCER: 'FREELANCER', COMPANY: 'COMPANY', ADMIN: 'ADMIN' }
export const ROLE_HOME = { FREELANCER: '/freelancer/dashboard', COMPANY: '/company/dashboard', ADMIN: '/admin/dashboard' }

// Navigation per role (UI only; real authorization lives in the backend)
export const NAV = {
  FREELANCER: [
    { to: '/freelancer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/projects', label: 'Find Projects', icon: Search },
    { to: '/freelancer/proposals', label: 'My Proposals', icon: FileText },
    { to: '/freelancer/hirings', label: 'My Hirings', icon: Handshake },
    { to: '/freelancer/profile', label: 'Profile', icon: User },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
  COMPANY: [
    { to: '/company/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/company/projects', label: 'My Projects', icon: FolderKanban },
    { to: '/company/proposals', label: 'Proposals', icon: Inbox },
    { to: '/company/hirings', label: 'Hirings', icon: Handshake },
    { to: '/company/profile', label: 'Company Profile', icon: Building2 },
    { to: '/notifications', label: 'Notifications', icon: Bell },
  ],
  ADMIN: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/projects', label: 'Projects', icon: FolderKanban },
    { to: '/admin/analytics', label: 'Analytics', icon: Percent },
    { to: '/admin/reports', label: 'Reports', icon: Flag },
    { to: '/admin/skills', label: 'Skills', icon: Tags },
  ],
}

// Single status -> style map so colours stay consistent everywhere
export const STATUS_STYLES = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  SHORTLISTED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  ACCEPTED: 'bg-green-50 text-green-700 ring-green-600/20',
  REJECTED: 'bg-red-50 text-red-700 ring-red-600/20',
  WITHDRAWN: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  OPEN: 'bg-green-50 text-green-700 ring-green-600/20',
  IN_PROGRESS: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  COMPLETED: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-600/20',
  ACTIVE: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  AVAILABLE: 'bg-green-50 text-green-700 ring-green-600/20',
  VIEWED: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  EXPIRED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  DENIED: 'bg-red-50 text-red-700 ring-red-600/20',
  SUSPENDED: 'bg-red-50 text-red-700 ring-red-600/20',
  RESOLVED: 'bg-green-50 text-green-700 ring-green-600/20',
  SUBMITTED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  REVISION_REQUESTED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  APPROVED: 'bg-green-50 text-green-700 ring-green-600/20',
}
