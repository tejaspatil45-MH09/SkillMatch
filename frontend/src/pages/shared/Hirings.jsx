import { useState } from 'react'
import { Handshake } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import HiringsTable from '../../components/hiring/HiringsTable'
import CancelHiringModal from '../../components/hiring/CancelHiringModal'
import ReviewModal from '../../components/review/ReviewModal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { hiringService } from '../../services/hiringService'
import { reviewService } from '../../services/reviewService'
import { labelize } from '../../utils/formatters'

const STATUSES = ['ALL', 'ACTIVE', 'COMPLETED', 'CANCELLED']

// One page for /company/hirings and /freelancer/hirings
export default function Hirings() {
  const { user } = useAuth()
  const toast = useToast()
  const isCompany = user.role === 'COMPANY'
  const { data, error, reload } = useAsync(() => hiringService.getHirings(), [])
  const [status, setStatus] = useState('ALL')
  const [modal, setModal] = useState(null)   // { kind: 'complete' | 'cancel' | 'review', hiring }
  const [busy, setBusy] = useState(false)
  const close = () => setModal(null)

  async function run(fn, message) {
    setBusy(true)
    try { await fn(); toast(message); close(); reload() }
    catch (e) { toast(e.message, 'error'); close(); reload() } finally { setBusy(false) }
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const sorted = data && [...data].sort((a, b) => Date.parse(b.startDate) - Date.parse(a.startDate))
  const shown = sorted && (status === 'ALL' ? sorted : sorted.filter((h) => h.status === status))
  const count = (s) => (s === 'ALL' ? data.length : data.filter((h) => h.status === s).length)
  const h = modal?.hiring
  const target = h && (isCompany ? h.freelancer.name : h.company.name)

  return (
    <div>
      <PageHeader title={isCompany ? 'Hirings' : 'My hirings'} description={isCompany ? 'Track the freelancers you have hired and complete finished projects.' : 'Track the projects you have been hired for.'} />
      {!data ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : !data.length ? <EmptyState icon={Handshake} title="No hirings yet" description={isCompany ? 'When you accept a shortlisted proposal, the hiring will appear here.' : 'When a company accepts your proposal, the hiring will appear here.'} />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {STATUSES.map((s) => <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', status === s ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s === 'ALL' ? 'All' : labelize(s)} ({count(s)})</button>)}
          </div>
          {shown.length ? <HiringsTable hirings={shown} isCompany={isCompany} viewerId={user.id}
            onComplete={(x) => setModal({ kind: 'complete', hiring: x })} onCancel={(x) => setModal({ kind: 'cancel', hiring: x })} onReview={(x) => setModal({ kind: 'review', hiring: x })} />
            : <EmptyState title={`No ${labelize(status).toLowerCase()} hirings`} description="Hirings with this status will appear here." />}
        </>}
      <ConfirmDialog open={modal?.kind === 'complete'} loading={busy} onClose={close} confirmLabel="Mark as Completed" title="Mark as completed?"
        onConfirm={() => run(() => hiringService.completeHiring(h.id), `Project completed. You can now review ${target}.`)}
        message={<><p>Are you sure you want to mark this project as completed?</p><p className="mt-2 text-xs text-slate-500">{h?.freelancer.name} will be notified, and you can both leave a review.</p></>} />
      {modal?.kind === 'cancel' && <CancelHiringModal open onClose={close} hiring={h} onConfirm={(reason) => run(() => hiringService.cancelHiring(h.id, reason), 'Hiring cancelled.')} />}
      {modal?.kind === 'review' && <ReviewModal open onClose={close} targetName={target} onSubmit={(r) => run(() => reviewService.createReview({ hiringId: h.id, ...r }), 'Review submitted. Thank you.')} />}
    </div>
  )
}
