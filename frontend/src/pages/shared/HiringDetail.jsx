import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Clock, FileText, RotateCcw } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner, { Skeleton } from '../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../components/ui/Badge'
import SubmitWorkForm from '../../components/work/SubmitWorkForm'
import SubmissionCard from '../../components/work/SubmissionCard'
import RequestRevisionModal from '../../components/work/RequestRevisionModal'
import HiringChat from '../../components/work/HiringChat'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { hiringService } from '../../services/hiringService'
import { submissionService } from '../../services/submissionService'
import { formatDate } from '../../utils/formatters'

// The mock API (npm run dev) has no work or messaging endpoints; say so plainly instead of showing a raw error
const needsBackend = (e) => /No route for/.test(e?.message ?? '')
const NEEDS_BACKEND = 'Work submission and messaging need the real backend. Start it and run the website with "npm run dev:real".'

// One page for /company/hirings/:hiringId and /freelancer/hirings/:hiringId
export default function HiringDetail() {
  const { hiringId } = useParams()
  const { user } = useAuth()
  const toast = useToast()
  const isCompany = user.role === 'COMPANY'
  const back = isCompany ? '/company/hirings' : '/freelancer/hirings'
  const hiring = useAsync(() => hiringService.getHiring(hiringId), [hiringId])
  const subs = useAsync(() => submissionService.list(hiringId), [hiringId])
  const [modal, setModal] = useState(null)      // 'approve' | 'revise'
  const [busy, setBusy] = useState(false)
  const reloadAll = () => { hiring.reload(); subs.reload() }

  const backLink = <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to hirings</Link>
  if (hiring.error) return <div>{backLink}<ErrorState message={needsBackend(hiring.error) ? NEEDS_BACKEND : hiring.error.status === 404 ? 'This hiring could not be found, or it is not yours to view.' : hiring.error.message} onRetry={needsBackend(hiring.error) ? undefined : hiring.reload} /></div>
  const h = hiring.data
  if (!h) return <div>{backLink}<LoadingSpinner label="Loading hiring" /></div>

  const other = isCompany ? h.freelancer : h.company
  const otherLink = isCompany ? `/freelancers/${h.freelancer.id}` : `/companies/${h.company.id}`
  const work = h.workStatus ?? 'IN_PROGRESS'
  const list = subs.data ?? []
  const latest = list[0]
  const active = h.status === 'ACTIVE'

  async function act(fn, message) {
    setBusy(true)
    try { await fn(); toast(message); setModal(null); reloadAll() }
    catch (e) { toast(e.message, 'error'); setModal(null); reloadAll() }      // a conflict means someone else acted first: show the current state
    finally { setBusy(false) }
  }

  // ---- the part of the page that depends on who you are and where the work stands
  let action
  if (h.status === 'CANCELLED') action = <Banner tone="red" icon={Clock} title="This hiring was cancelled">{h.cancelReason ? `Reason: ${h.cancelReason}` : 'No further work can be submitted.'}</Banner>
  else if (h.status === 'COMPLETED') action = <Banner tone="green" icon={CheckCircle2} title="Project completed">{work === 'APPROVED' ? 'The submitted work was approved. ' : ''}Both of you can leave a review from <Link to={back} className="font-medium underline">your hirings list</Link>.</Banner>
  else if (!isCompany && (work === 'IN_PROGRESS' || work === 'REVISION_REQUESTED')) action = (
    <Card className="p-6">
      {work === 'REVISION_REQUESTED' && latest?.feedback && <div className="mb-5"><Banner tone="amber" icon={RotateCcw} title="The company asked for changes"><span className="whitespace-pre-wrap break-words">{latest.feedback}</span></Banner></div>}
      <h2 className="text-lg font-semibold text-slate-900">{work === 'REVISION_REQUESTED' ? 'Submit a revision' : 'Submit your work'}</h2>
      <p className="mb-5 mt-1 text-slate-500">{work === 'REVISION_REQUESTED' ? 'Your earlier versions stay in the history. This adds a new version.' : 'Share a link to your repository or live demo and describe what you are delivering. The company will review it.'}</p>
      <SubmitWorkForm key={latest?.id ?? 'first'} isRevision={work === 'REVISION_REQUESTED'} initial={work === 'REVISION_REQUESTED' ? latest : undefined}
        onSubmit={async (data) => { await submissionService.submit(hiringId, data); toast('Work submitted. The company has been notified.'); reloadAll() }} />
    </Card>)
  else if (!isCompany && work === 'SUBMITTED') action = <Banner tone="indigo" icon={Clock} title="Waiting for the company to review your work">You will be notified when they approve it or ask for changes.</Banner>
  else if (isCompany && work === 'SUBMITTED') action = <Banner tone="indigo" icon={ClipboardCheck} title={`${h.freelancer.name} submitted work for your review`}>Open the links below, then approve it or request a revision.</Banner>
  else if (isCompany) action = <Banner tone="slate" icon={Clock} title={work === 'REVISION_REQUESTED' ? 'Waiting for the revised submission' : 'Waiting for the freelancer to submit work'}>{work === 'REVISION_REQUESTED' ? 'You asked for changes. You will be notified when a new version arrives.' : 'You will be notified as soon as work is submitted.'}</Banner>

  return (
    <div>
      {backLink}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{h.project.title}</h1>
          <p className="mt-1 text-slate-500">{isCompany ? 'Freelancer' : 'Company'}: <Link to={otherLink} className="text-slate-700 hover:text-brand-600">{other.name}</Link> · Started {formatDate(h.startDate)}{h.completedAt && ` · Completed ${formatDate(h.completedAt)}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={h.status} />{active && <StatusBadge status={work} />}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          {action}
          <section aria-labelledby="history-title">
            <h2 id="history-title" className="mb-3 text-lg font-semibold text-slate-900">Submissions</h2>
            {subs.error ? <ErrorState message={needsBackend(subs.error) ? NEEDS_BACKEND : subs.error.message} onRetry={needsBackend(subs.error) ? undefined : subs.reload} />
              : !subs.data ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
              : !list.length ? <EmptyState icon={FileText} title="No work submitted yet" description={isCompany ? 'Submitted work, with its repository and demo links, will appear here for your review.' : 'When you submit work it appears here, together with every later version.'} />
              : <div className="space-y-4">{list.map((s, i) => (
                <SubmissionCard key={s.id} s={s} current={i === 0}>
                  {isCompany && active && s.status === 'SUBMITTED' && (
                    <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
                      <Button onClick={() => setModal('approve')}><CheckCircle2 className="size-4" aria-hidden />Approve work</Button>
                      <Button variant="secondary" onClick={() => setModal('revise')}><RotateCcw className="size-4" aria-hidden />Request revision</Button>
                    </div>)}
                </SubmissionCard>))}</div>}
          </section>
        </div>
        <div className="lg:col-span-2">
          <HiringChat hiringId={hiringId} viewerId={user.id} otherName={other.name} onRead={hiring.reload}
            readOnly={h.status === 'CANCELLED' ? 'This hiring was cancelled, so the conversation is read-only.' : undefined} />
        </div>
      </div>

      <ConfirmDialog open={modal === 'approve'} loading={busy} onClose={() => setModal(null)} confirmLabel="Approve and complete" title="Approve this work?"
        onConfirm={() => act(() => submissionService.approve(hiringId, latest.id), `Work approved and project completed. You can now review ${h.freelancer.name}.`)}
        message={<><p>Approving accepts version {latest?.version} and marks "{h.project.title}" as completed.</p><p className="mt-2 text-xs text-slate-500">{h.freelancer.name} will be notified, and you can both leave a review. This cannot be undone.</p></>} />
      {modal === 'revise' && <RequestRevisionModal open onClose={() => setModal(null)} freelancerName={h.freelancer.name}
        onConfirm={(feedback) => act(() => submissionService.requestRevision(hiringId, latest.id, feedback), 'Revision requested. The freelancer has been notified.')} />}
    </div>
  )
}

const TONES = { red: 'border-red-200 bg-red-50 text-red-900', green: 'border-green-200 bg-green-50 text-green-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900', slate: 'border-slate-200 bg-slate-50 text-slate-800' }
function Banner({ tone, icon: Icon, title, children }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${TONES[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div><p className="font-medium">{title}</p><p className="mt-1 text-sm">{children}</p></div>
    </div>
  )
}
