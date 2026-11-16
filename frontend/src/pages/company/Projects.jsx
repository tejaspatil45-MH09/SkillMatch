import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, FolderKanban, Inbox, Plus, Wallet } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { projectService } from '../../services/projectService'
import { budgetRange, formatDate, labelize } from '../../utils/formatters'

const STATUSES = ['ALL', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

export default function Projects() {
  const { data, error, reload } = useAsync(() => projectService.getCompanyProjects(), [])
  const [status, setStatus] = useState('ALL')
  const create = <Button as={Link} to="/company/projects/create"><Plus className="size-4" aria-hidden />Create project</Button>
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const shown = data && (status === 'ALL' ? data : data.filter((p) => p.status === status))
  const count = (s) => (s === 'ALL' ? data.length : data.filter((p) => p.status === s).length)
  return (
    <div>
      <PageHeader title="My projects" description="Create projects and review the proposals you receive." action={create} />
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        : !data.length ? <EmptyState icon={FolderKanban} title="No projects yet" description="Post your first project to start receiving proposals from freelancers." action={create} />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
          </div>
          {shown.length ? <ul className="space-y-3">{shown.map((p) => (
            <li key={p.id}><Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Link to={`/company/projects/${p.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{p.title}</Link><StatusBadge status={p.status} /></div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-slate-600"><span className="flex items-center gap-1.5"><Wallet className="size-4 text-slate-400" aria-hidden />{budgetRange(p)}</span><span className="flex items-center gap-1.5"><CalendarClock className="size-4 text-slate-400" aria-hidden />Due {formatDate(p.deadline)}</span><span className="flex items-center gap-1.5"><Inbox className="size-4 text-slate-400" aria-hidden />{p.proposalCount} {p.proposalCount === 1 ? 'proposal' : 'proposals'}</span></div>
              </div>
              <div className="flex shrink-0 gap-2"><Button as={Link} to={`/company/projects/${p.id}/proposals`} size="sm">View proposals</Button><Button as={Link} to={`/company/projects/${p.id}`} size="sm" variant="secondary">Details</Button></div>
            </Card></li>))}</ul>
            : <EmptyState title={`No ${labelize(status).toLowerCase()} projects`} description="Projects with this status will appear here." />}
        </>}
    </div>
  )
}
