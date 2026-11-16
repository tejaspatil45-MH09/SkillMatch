import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Handshake, Inbox, Pencil, XCircle } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../components/ui/Badge'
import SkillsList from '../../components/profile/SkillsList'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { projectService } from '../../services/projectService'
import { budgetRange, formatDate } from '../../utils/formatters'

export default function ProjectDetail() {
  const { projectId } = useParams()
  const toast = useToast()
  const { data: p, error, reload } = useAsync(() => projectService.getProject(projectId), [projectId])
  const [closing, setClosing] = useState(false)
  const [busy, setBusy] = useState(false)
  async function close() {
    setBusy(true)
    try { await projectService.closeProject(projectId); toast('Project closed.'); setClosing(false); reload() }
    catch (e) { toast(e.message, 'error'); setClosing(false) } finally { setBusy(false) }
  }
  const back = <Link to="/company/projects" className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to projects</Link>
  if (error) return <div>{back}<ErrorState message={error.message} onRetry={reload} /></div>
  if (!p) return <LoadingSpinner label="Loading project" />
  return (
    <div>
      {back}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-slate-900">{p.title}</h1><StatusBadge status={p.status} /></div><p className="mt-1 text-slate-500">Posted {formatDate(p.createdAt)}</p></div>
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to={`/company/projects/${p.id}/proposals`}><Inbox className="size-4" aria-hidden />View proposals ({p.proposalCount})</Button>
            {p.status === 'OPEN' && <><Button as={Link} to={`/company/projects/${p.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden />Edit</Button>
              <Button variant="secondary" className="text-red-600" onClick={() => setClosing(true)}><XCircle className="size-4" aria-hidden />Close project</Button></>}
          </div>
        </div>
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          {[['Budget', budgetRange(p)], ['Deadline', formatDate(p.deadline)], ['Proposals received', p.proposalCount]].map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 p-4"><dt className="text-xs text-slate-500">{l}</dt><dd className="mt-1 font-semibold text-slate-900">{v}</dd></div>)}
        </dl>
        <h2 className="mb-2 mt-8 font-semibold text-slate-900">Description</h2><p className="whitespace-pre-line text-slate-700">{p.description}</p>
        <h2 className="mb-2 mt-8 font-semibold text-slate-900">Required skills</h2><SkillsList skills={p.skills} />
      </Card>
      {p.status === 'IN_PROGRESS' && <div role="status" className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-sky-200 bg-sky-50 p-5"><p className="flex items-center gap-2 text-sky-900"><Handshake className="size-5" aria-hidden />A freelancer has been hired and this project is in progress.</p><Button as={Link} to="/company/hirings" variant="secondary" size="sm">View hirings</Button></div>}
      {p.status === 'CANCELLED' && <p role="status" className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-600">This project was closed and no longer accepts proposals.</p>}
      <ConfirmDialog open={closing} danger loading={busy} onClose={() => setClosing(false)} onConfirm={close} title="Close this project?" confirmLabel="Close project" message="The project will be marked Cancelled and stop accepting proposals. Pending and shortlisted proposals will be rejected." />
    </div>
  )
}
