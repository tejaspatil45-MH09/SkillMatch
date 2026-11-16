import { useState } from 'react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import { StatusBadge } from '../../components/ui/Badge'
import Table from '../../components/ui/Table'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services/adminService'
import { budgetRange, formatDate, labelize } from '../../utils/formatters'

const STATUSES = ['ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
export default function Projects() {
  const { data, error, reload } = useAsync(() => adminService.getProjects(), [])
  const [status, setStatus] = useState('ALL')
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const shown = data && (status === 'ALL' ? data : data.filter((p) => p.status === status))
  const count = (s) => (s === 'ALL' ? data.length : data.filter((p) => p.status === s).length)
  const columns = [
    { key: 'title', header: 'Project', primary: true, render: (p) => <Link to={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.title}</Link> },
    { key: 'company', header: 'Company', render: (p) => p.company.name },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'budget', header: 'Budget', render: (p) => budgetRange(p) },
    { key: 'proposals', header: 'Proposals', render: (p) => p.proposalCount },
    { key: 'createdAt', header: 'Posted', render: (p) => formatDate(p.createdAt) },
  ]
  return (
    <div>
      <PageHeader title="Projects" description="All projects posted on the platform." />
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s} className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
        </div>
        {shown.length ? <Table columns={columns} rows={shown} caption="Projects" /> : <EmptyState title={`No ${labelize(status).toLowerCase()} projects`} description="Projects with this status will appear here." />}</>}
    </div>
  )
}
