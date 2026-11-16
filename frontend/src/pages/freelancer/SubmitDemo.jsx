import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import DemoStatus from '../../components/demo/DemoStatus'
import DemoSubmitForm from '../../components/demo/DemoSubmitForm'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { proposalService } from '../../services/proposalService'
import { demoService } from '../../services/demoService'

export default function SubmitDemo() {
  const { proposalId } = useParams()
  const toast = useToast()
  const { data: p, error, reload } = useAsync(() => proposalService.getProposal(proposalId), [proposalId])
  const [submitted, setSubmitted] = useState(null)
  const back = `/freelancer/proposals/${proposalId}`

  async function onSubmit(data) {
    try { setSubmitted(await demoService.submitDemo(proposalId, data)); toast('Demo submitted. The company has been notified.') }
    catch (e) { toast(e.message, 'error'); if (e.status === 409) reload() }
  }
  const backLink = <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to proposal</Link>
  if (error) return <div>{backLink}<ErrorState message={error.message} onRetry={reload} /></div>
  if (!p) return <LoadingSpinner label="Loading proposal" />

  const demo = submitted ?? p.demo
  let body
  if (demo) body = (
    <Card className="p-8 text-center">
      <CheckCircle2 className="mx-auto size-12 text-green-600" aria-hidden />
      <h1 className="mt-4 text-xl font-semibold text-slate-900">Demo Submitted</h1>
      <div className="mx-auto mt-6 flex max-w-xs items-center justify-between rounded-lg bg-slate-50 p-4"><span className="text-slate-600">Status</span><span className="font-medium text-slate-900">{demo.status === 'AVAILABLE' ? 'Waiting for Company Review' : demo.status === 'VIEWED' ? 'Viewed by company' : 'Access window ended'}</span></div>
      <div className="mx-auto mt-4 max-w-md"><DemoStatus demo={demo} /></div>
      <Button as={Link} to={back} className="mt-6">Back to proposal</Button>
    </Card>)
  else if (p.status !== 'SHORTLISTED') body = <EmptyState title="Demo can't be submitted" description={p.status === 'REJECTED' ? "Demos can't be submitted for rejected proposals." : 'Demos can be submitted once your proposal has been shortlisted.'} action={<Button as={Link} to={back} variant="secondary">Back to proposal</Button>} />
  else body = <Card className="p-6"><h1 className="text-xl font-semibold text-slate-900">Submit a demo</h1><p className="mb-6 mt-1 text-slate-500">For "{p.project.title}" · {p.project.companyName}</p><DemoSubmitForm onSubmit={onSubmit} /></Card>
  return <div className="mx-auto max-w-2xl">{backLink}{body}</div>
}
