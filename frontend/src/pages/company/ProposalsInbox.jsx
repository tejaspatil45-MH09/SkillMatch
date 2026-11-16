import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Card from '../../components/ui/Card'
import Avatar from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { proposalService } from '../../services/proposalService'
import { formatINR, labelize, timeAgo } from '../../utils/formatters'

const STATUSES = ['ALL', 'PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']

export default function ProposalsInbox() {
  const { data, error, reload } = useAsync(() => proposalService.getCompanyProposals(), [])
  const [status, setStatus] = useState('ALL')
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const sorted = data && [...data].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const shown = sorted && (status === 'ALL' ? sorted : sorted.filter((p) => p.status === status))
  const count = (s) => (s === 'ALL' ? data.length : data.filter((p) => p.status === s).length)
  return (
    <div>
      <PageHeader title="Proposals" description="Proposals across all of your projects, newest first." />
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : !data.length ? <EmptyState icon={Inbox} title="No proposals yet" description="Once freelancers apply to your projects, their proposals will appear here." />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
          </div>
          {shown.length ? <ul className="space-y-3">{shown.map((p) => (
            <li key={p.id}><Link to={`/company/projects/${p.project.id}/proposals`} className="block"><Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3"><Avatar name={p.freelancer.name} size="sm" /><div className="min-w-0"><p className="truncate font-medium text-slate-900">{p.freelancer.name}</p><p className="truncate text-slate-500">{p.project.title} · {timeAgo(p.createdAt)}</p></div></div>
              <div className="flex items-center gap-4 sm:shrink-0"><span className="text-slate-900">{formatINR(p.bidAmount)}</span><span className="text-slate-500">{p.skillMatch}% match</span><StatusBadge status={p.status} /></div>
            </Card></Link></li>))}</ul>
            : <EmptyState title={`No ${labelize(status).toLowerCase()} proposals`} description="Proposals with this status will appear here." />}
        </>}
    </div>
  )
}
