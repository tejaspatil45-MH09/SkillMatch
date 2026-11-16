import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Table from '../../components/ui/Table'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { adminService } from '../../services/adminService'
import { formatDate, labelize } from '../../utils/formatters'

export default function Users() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { data, error, reload } = useAsync(() => adminService.getUsers(), [])
  const [q, setQ] = useState(''); const [role, setRole] = useState('ALL')
  const [target, setTarget] = useState(null); const [busy, setBusy] = useState(false)
  if (error) return <ErrorState message={error.message} onRetry={reload} />

  async function toggle() {
    setBusy(true)
    try {
      await (target.status === 'SUSPENDED' ? adminService.reinstateUser(target.id) : adminService.suspendUser(target.id))
      toast(target.status === 'SUSPENDED' ? `${target.name} was reinstated.` : `${target.name} was suspended.`); setTarget(null); reload()
    } catch (e) { toast(e.message, 'error'); setTarget(null) } finally { setBusy(false) }
  }
  const shown = data?.filter((u) => (role === 'ALL' || u.role === role) && (u.name + u.email).toLowerCase().includes(q.toLowerCase()))
  const profileLink = (u) => (u.role === 'FREELANCER' ? `/freelancers/${u.id}` : u.role === 'COMPANY' ? `/companies/${u.id}` : null)
  const columns = [
    { key: 'name', header: 'User', primary: true, render: (u) => <div className="flex items-center gap-3"><Avatar name={u.name} size="sm" /><div className="min-w-0 text-left">{profileLink(u) ? <Link to={profileLink(u)} className="font-medium text-slate-900 hover:text-brand-600">{u.name}</Link> : <span className="font-medium text-slate-900">{u.name}</span>}<p className="truncate text-xs font-normal text-slate-500">{u.email}</p></div></div> },
    { key: 'role', header: 'Role', render: (u) => <Badge>{labelize(u.role)}</Badge> },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'createdAt', header: 'Joined', render: (u) => formatDate(u.createdAt) },
    { key: 'actions', header: 'Actions', render: (u) => u.role === 'ADMIN' || u.id === me.id ? <span className="text-xs text-slate-500">Not available</span>
      : <Button size="sm" variant={u.status === 'SUSPENDED' ? 'secondary' : 'ghost'} className={u.status === 'SUSPENDED' ? '' : 'text-red-600 hover:bg-red-50'} onClick={() => setTarget(u)}>{u.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}</Button> },
  ]
  return (
    <div>
      <PageHeader title="Users" description="View accounts and suspend or reinstate access." />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden /><input aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" /></div>
        <Select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} options={[['ALL', 'All roles'], ['FREELANCER', 'Freelancers'], ['COMPANY', 'Companies'], ['ADMIN', 'Admins']]} />
      </div>
      {!data ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : shown.length ? <Table columns={columns} rows={shown} caption="Users" /> : <EmptyState title="No users found" description="Try a different search or role filter." />}
      <ConfirmDialog open={!!target} danger={target?.status !== 'SUSPENDED'} loading={busy} onClose={() => setTarget(null)} onConfirm={toggle}
        title={target?.status === 'SUSPENDED' ? 'Reinstate this user?' : 'Suspend this user?'} confirmLabel={target?.status === 'SUSPENDED' ? 'Reinstate' : 'Suspend'}
        message={target && (target.status === 'SUSPENDED' ? `${target.name} will be able to log in and use SkillMatch again.` : `${target.name} will be signed out of every request and won't be able to use SkillMatch until reinstated.`)} />
    </div>
  )
}
