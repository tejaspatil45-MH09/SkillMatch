import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Inbox } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Card from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import ProposalCard from '../../components/proposal/ProposalCard'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { projectService } from '../../services/projectService'
import { proposalService } from '../../services/proposalService'
import { labelize } from '../../utils/formatters'

const STATUSES = ['ALL', 'PENDING', 'SHORTLISTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']

export default function ProjectProposals() {
  const { projectId } = useParams()
  const toast = useToast()
  const project = useAsync(() => projectService.getProject(projectId), [projectId])
  const proposals = useAsync(() => proposalService.getProjectProposals(projectId), [projectId])
  const [status, setStatus] = useState('ALL')
  const [confirm, setConfirm] = useState(null)   // { kind: 'accept' | 'reject', proposal }
  const [busyId, setBusyId] = useState(null)
  const reload = () => { project.reload(); proposals.reload() }

  async function act(kind, p) {
    setBusyId(p.id)
    try {
      if (kind === 'shortlist') { await proposalService.shortlist(p.id); toast(`${p.freelancer.name} was shortlisted.`) }
      if (kind === 'reject') { await proposalService.reject(p.id); toast('Proposal rejected.') }
      if (kind === 'accept') { await proposalService.accept(p.id); toast(`${p.freelancer.name} has been hired.`) }
      setConfirm(null); reload()
    } catch (e) { toast(e.message, 'error'); setConfirm(null) } finally { setBusyId(null) }
  }
  const err = project.error ?? proposals.error
  if (err) return <ErrorState message={err.message} onRetry={reload} />
  const list = proposals.data, p = project.data
  const shown = list && (status === 'ALL' ? list : list.filter((x) => x.status === status))
  const count = (s) => (s === 'ALL' ? list.length : list.filter((x) => x.status === s).length)

  return (
    <div>
      <Link to={`/company/projects/${projectId}`} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to project</Link>
      <PageHeader title="Proposals" description={p ? p.title : ' '} action={p && <StatusBadge status={p.status} />} />
      {p && p.status !== 'OPEN' && <p role="status" className="mb-4 rounded-lg bg-slate-50 p-3 text-slate-600">This project is {labelize(p.status).toLowerCase()}, so proposals can no longer be shortlisted, rejected or accepted.</p>}
      {!list || !p ? <div className="space-y-4">{[0, 1].map((i) => <Card key={i} className="space-y-3 p-5"><Skeleton className="h-5 w-1/3" /><Skeleton /><Skeleton className="h-4 w-2/3" /></Card>)}</div>
        : !list.length ? <EmptyState icon={Inbox} title="No proposals yet" description="Once freelancers apply to this project, their proposals will appear here." />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
          </div>
          {shown.length ? <div className="space-y-4">{shown.map((x) => <ProposalCard key={x.id} proposal={x} projectSkills={p.skills} projectOpen={p.status === 'OPEN'} busy={busyId === x.id}
            onShortlist={(pr) => act('shortlist', pr)} onReject={(pr) => setConfirm({ kind: 'reject', proposal: pr })} onAccept={(pr) => setConfirm({ kind: 'accept', proposal: pr })} />)}</div>
            : <EmptyState title={`No ${labelize(status).toLowerCase()} proposals`} description="Proposals with this status will appear here." />}
        </>}
      <ConfirmDialog open={confirm?.kind === 'accept'} loading={!!busyId} onClose={() => setConfirm(null)} onConfirm={() => act('accept', confirm.proposal)} title="Accept and hire?" confirmLabel="Accept and hire"
        message={confirm && `Hire ${confirm.proposal.freelancer.name} for "${p?.title}"? All other proposals will be rejected and the project will move to In Progress.`} />
      <ConfirmDialog open={confirm?.kind === 'reject'} danger loading={!!busyId} onClose={() => setConfirm(null)} onConfirm={() => act('reject', confirm.proposal)} title="Reject this proposal?" confirmLabel="Reject"
        message={confirm && `${confirm.proposal.freelancer.name} will be notified that their proposal was rejected.`} />
    </div>
  )
}
