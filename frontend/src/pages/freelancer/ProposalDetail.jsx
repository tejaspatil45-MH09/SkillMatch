import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PartyPopper, Undo2 } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../components/ui/Badge'
import DemoStatus from '../../components/demo/DemoStatus'
import SkillMatchBadge from '../../components/project/SkillMatchBadge'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { proposalService } from '../../services/proposalService'
import { demoService } from '../../services/demoService'
import { formatDate, formatINR } from '../../utils/formatters'

const Panel = ({ tone = 'slate', title, children }) => {
  const tones = { slate: 'border-slate-200 bg-slate-50', green: 'border-green-200 bg-green-50', indigo: 'border-indigo-200 bg-indigo-50' }
  return <div role="status" className={`rounded-xl border p-5 ${tones[tone]}`}><h2 className="font-semibold text-slate-900">{title}</h2><div className="mt-1.5 text-slate-700">{children}</div></div>
}

export default function ProposalDetail() {
  const { proposalId } = useParams()
  const toast = useToast()
  const { data: p, error, reload } = useAsync(() => proposalService.getProposal(proposalId), [proposalId])
  const [confirm, setConfirm] = useState(null)   // 'withdraw' | 'reissue'
  const [busy, setBusy] = useState(false)

  async function run(kind) {
    setBusy(true)
    try {
      if (kind === 'withdraw') { await proposalService.withdraw(proposalId); toast('Proposal withdrawn.') }
      else { await demoService.reissueDemo(p.demo.id); toast('A new 24-hour access window has been issued.') }
      setConfirm(null); reload()
    } catch (e) { toast(e.message, 'error'); setConfirm(null) } finally { setBusy(false) }
  }
  if (error) return <div><Link to="/freelancer/proposals" className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to proposals</Link><ErrorState message={error.message} onRetry={reload} /></div>
  if (!p) return <LoadingSpinner label="Loading proposal" />
  const canWithdraw = ['PENDING', 'SHORTLISTED'].includes(p.status)

  return (
    <div>
      <Link to="/freelancer/proposals" className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to proposals</Link>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h1 className="text-2xl font-semibold text-slate-900">{p.project.title}</h1><p className="mt-1 text-slate-500">{p.project.companyName} · Submitted {formatDate(p.createdAt)}</p></div><StatusBadge status={p.status} />
            </div>
            <h2 className="mb-2 mt-6 font-semibold text-slate-900">Your cover letter</h2><p className="whitespace-pre-line text-slate-700">{p.coverLetter}</p>
          </Card>

          {p.status === 'SHORTLISTED' && <>
            <Panel tone="indigo" title={<span className="flex items-center gap-2"><PartyPopper className="size-5 text-indigo-600" aria-hidden />Congratulations! You have been shortlisted.</span>}>
              {p.demo ? 'Your demo has been submitted. The company can open it once within 24 hours.' : `${p.project.companyName} would like to see a demo of your work. Submit one to move forward.`}</Panel>
            <Card className="p-6">
              <h2 className="mb-3 font-semibold text-slate-900">Demo</h2>
              {!p.demo ? <><p className="mb-4 text-slate-600">Your demo is only accessible to the company associated with this project.</p><Button as={Link} to={`/freelancer/proposals/${p.id}/demo`}>Submit Demo</Button></>
                : <div className="space-y-4"><DemoStatus demo={p.demo} /><p className="text-slate-600">{p.demo.description}</p>
                  {p.demo.status === 'AVAILABLE' ? <p className="text-xs text-slate-500">Waiting for company review.</p>
                    : <div><p className="mb-3 text-xs text-slate-500">If the company missed the window, you can issue a new 24-hour access window. The company will be notified.</p><Button variant="secondary" onClick={() => setConfirm('reissue')}>Issue new access window</Button></div>}</div>}
            </Card></>}
          {p.status === 'PENDING' && <Panel title="Waiting for company review">The company hasn't reviewed your proposal yet. You'll be notified when its status changes.</Panel>}
          {p.status === 'ACCEPTED' && <Panel tone="green" title="You've been hired">{p.project.companyName} accepted your proposal. <Link to="/freelancer/hirings" className="font-medium text-brand-600 hover:text-brand-700">View your hirings</Link></Panel>}
          {p.status === 'REJECTED' && <Panel title="This proposal was not selected">Demos can't be submitted for rejected proposals. <Link to="/projects" className="font-medium text-brand-600 hover:text-brand-700">Find other projects</Link></Panel>}
          {p.status === 'WITHDRAWN' && <Panel title="You withdrew this proposal">The company can no longer see it as active.</Panel>}
        </div>
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">Proposal summary</h2><SkillMatchBadge value={p.skillMatch} /></div>
            <dl className="mt-4 space-y-3 text-slate-600"><div className="flex justify-between"><dt>Bid</dt><dd className="font-medium text-slate-900">{formatINR(p.bidAmount)}</dd></div><div className="flex justify-between"><dt>Estimated time</dt><dd className="font-medium text-slate-900">{p.estimatedDays} days</dd></div></dl>
            <Button as={Link} to={`/projects/${p.project.id}`} variant="secondary" className="mt-5 w-full">View project</Button>
            {canWithdraw && <Button variant="ghost" className="mt-2 w-full text-red-600 hover:bg-red-50" onClick={() => setConfirm('withdraw')}><Undo2 className="size-4" aria-hidden />Withdraw proposal</Button>}
          </Card>
        </div>
      </div>
      <ConfirmDialog open={confirm === 'withdraw'} danger loading={busy} onClose={() => setConfirm(null)} onConfirm={() => run('withdraw')} title="Withdraw this proposal?" confirmLabel="Withdraw" message="The company will no longer see it as active. This can't be undone." />
      <ConfirmDialog open={confirm === 'reissue'} loading={busy} onClose={() => setConfirm(null)} onConfirm={() => run('reissue')} title="Issue a new access window?" confirmLabel="Issue new window" message="The company will be able to open the demo once more within the next 24 hours." />
    </div>
  )
}
