import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Info, Lock, Eye } from 'lucide-react'
import Card from '../../components/ui/Card'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DemoAccessPanel from '../../components/demo/DemoAccessPanel'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { proposalService } from '../../services/proposalService'
import { demoService } from '../../services/demoService'

export default function DemoAccess() {
  const { proposalId } = useParams()
  const toast = useToast()
  const proposal = useAsync(() => proposalService.getProposal(proposalId), [proposalId])
  const demo = useAsync(() => demoService.checkAccess(proposalId), [proposalId])
  const [confirming, setConfirming] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [revealed, setRevealed] = useState(null)
  const [denied, setDenied] = useState(false)

  // Access is consumed only after the user confirms AND the server says yes
  async function view() {
    setConfirming(false); setViewing(true)
    try { setRevealed(await demoService.accessDemo(demo.data.id)); toast('Demo opened. Your one-time access has been used.'); demo.reload() }
    catch (e) {
      if (e.code === 'ACCESS_DENIED') setDenied(true)
      else { toast(e.message, 'error'); demo.reload() }   // viewed/expired elsewhere: refresh the real status
    } finally { setViewing(false) }
  }

  const isDenied = denied || proposal.error?.status === 403 || demo.error?.code === 'ACCESS_DENIED'
  const hardError = !isDenied && (proposal.error ?? (demo.error?.code !== 'NO_DEMO' ? demo.error : null))
  const loading = !isDenied && !hardError && (!proposal.data || (!demo.data && !demo.error))
  const p = proposal.data

  if (hardError) return <ErrorState message={hardError.message} onRetry={() => { proposal.reload(); demo.reload() }} />
  if (loading) return <LoadingSpinner label="Checking demo access" />
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={p ? `/company/projects/${p.project.id}/proposals` : '/company/proposals'} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to proposals</Link>
      <h1 className="text-2xl font-semibold text-slate-900">Demo access</h1>
      {p && !isDenied && <p className="mb-6 mt-1 text-slate-500">{p.freelancer.name} · {p.project.title}</p>}
      <div className={`grid gap-6 lg:grid-cols-3 ${isDenied ? 'mt-6' : ''}`}>
        <div className="lg:col-span-2"><DemoAccessPanel demo={isDenied ? null : demo.data} denied={isDenied} revealed={revealed} viewing={viewing} onView={() => setConfirming(true)} /></div>
        <Card className="h-fit p-6">
          <h2 className="font-semibold text-slate-900">How demo access works</h2>
          <ul className="mt-4 space-y-3 text-slate-600">
            <li className="flex gap-3"><Lock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />Only the company that owns the project can open it.</li>
            <li className="flex gap-3"><Eye className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />It can be viewed once.</li>
            <li className="flex gap-3"><Clock className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />Access closes 24 hours after submission.</li>
          </ul>
          <p className="mt-5 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />This is platform-level access control. It cannot prevent screenshots or screen recording.</p>
        </Card>
      </div>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} onConfirm={view} title="Use your one-time view?" confirmLabel="View demo"
        message="This will use your one-time view. Once the demo is revealed, it can't be opened again from SkillMatch. Continue?" />
    </div>
  )
}
