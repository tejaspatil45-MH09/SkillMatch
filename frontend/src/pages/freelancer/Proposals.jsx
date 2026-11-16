import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import ProposalsTable from '../../components/proposal/ProposalsTable'
import { useAsync } from '../../hooks/useAsync'
import { proposalService } from '../../services/proposalService'
import { labelize } from '../../utils/formatters'

const STATUSES = ['ALL', 'PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']

export default function Proposals() {
  const { data, error, reload } = useAsync(() => proposalService.getMyProposals(), [])
  const [status, setStatus] = useState('ALL')
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const shown = data && (status === 'ALL' ? data : data.filter((p) => p.status === status))
  const count = (s) => (s === 'ALL' ? data.length : data.filter((p) => p.status === s).length)
  return (
    <div>
      <PageHeader title="My proposals" description="Track every proposal you've submitted." />
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
        : !data.length ? <EmptyState icon={FileText} title="No proposals yet" description="Browse open projects and submit your first proposal." action={<Button as={Link} to="/projects">Find projects</Button>} />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
          </div>
          {shown.length ? <ProposalsTable proposals={shown} /> : <EmptyState title={`No ${labelize(status).toLowerCase()} proposals`} description="Proposals with this status will appear here." />}
        </>}
    </div>
  )
}
