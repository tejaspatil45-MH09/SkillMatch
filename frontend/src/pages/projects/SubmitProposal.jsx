import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Info } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../components/ui/Badge'
import EmptyState from '../../components/ui/EmptyState'
import SkillsList from '../../components/profile/SkillsList'
import SkillMatchBadge from '../../components/project/SkillMatchBadge'
import ProposalForm from '../../components/proposal/ProposalForm'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { projectService } from '../../services/projectService'
import { proposalService } from '../../services/proposalService'
import { budgetRange, formatDate, formatINR } from '../../utils/formatters'

export default function SubmitProposal() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const { data: p, error, reload } = useAsync(() => projectService.getProject(projectId), [projectId])
  const [submitted, setSubmitted] = useState(null)
  const [duplicate, setDuplicate] = useState(null)

  async function onSubmit(data) {
    try { setSubmitted(await proposalService.submitProposal(projectId, data)); toast('Proposal submitted.') }
    catch (e) { if (e.code === 'DUPLICATE_PROPOSAL') setDuplicate(true); else toast(e.message, 'error') }
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!p) return <LoadingSpinner label="Loading project" />

  const back = <Link to={`/projects/${p.id}`} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to project</Link>
  let main
  if (submitted) main = (
    <Card className="p-8 text-center">
      <CheckCircle2 className="mx-auto size-12 text-green-600" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Proposal submitted</h1>
      <p className="mt-2 text-slate-600">{p.company.name} has been notified. You'll get a notification when the status changes.</p>
      <div className="mx-auto mt-6 flex max-w-xs items-center justify-between rounded-lg bg-slate-50 p-4"><span className="text-slate-600">Status</span><StatusBadge status={submitted.status} /></div>
      <p className="mt-3 text-slate-600">Bid {formatINR(submitted.bidAmount)} · {submitted.estimatedDays} days</p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button as={Link} to="/freelancer/proposals">View my proposals</Button><Button as={Link} to="/projects" variant="secondary">Browse more projects</Button></div>
    </Card>)
  else if (p.hasApplied || duplicate) main = <EmptyState title="You've already submitted a proposal" description="Only one proposal per project is allowed." action={<Button as={Link} to={p.proposalId ? `/freelancer/proposals/${p.proposalId}` : '/freelancer/proposals'}>View your proposal</Button>} />
  else if (p.status !== 'OPEN') main = <EmptyState title="This project is closed" description="It is no longer accepting proposals." action={<Button as={Link} to="/projects" variant="secondary">Browse projects</Button>} />
  else main = (
    <Card className="p-6"><h1 className="text-xl font-semibold text-slate-900">Submit a proposal</h1><p className="mb-6 mt-1 text-slate-500">For "{p.title}"</p>
      <ProposalForm onSubmit={onSubmit} budgetHint={`Project budget: ${budgetRange(p)}`} /></Card>)

  return (
    <div>
      {back}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">{main}</div>
        <Card className="h-fit p-6">
          <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-slate-900">{p.title}</h2><SkillMatchBadge value={p.skillMatch} /></div>
          <p className="mt-1 text-slate-500">{p.company.name}</p>
          <dl className="mt-4 space-y-2 text-slate-600"><div className="flex justify-between"><dt>Budget</dt><dd className="font-medium text-slate-900">{budgetRange(p)}</dd></div><div className="flex justify-between"><dt>Deadline</dt><dd className="font-medium text-slate-900">{formatDate(p.deadline)}</dd></div></dl>
          <div className="mt-4"><SkillsList skills={p.skills} highlight={user.profile.skills} /></div>
          <p className="mt-5 flex gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />You can submit one proposal per project. You can withdraw it later while it is pending or shortlisted.</p>
        </Card>
      </div>
    </div>
  )
}
