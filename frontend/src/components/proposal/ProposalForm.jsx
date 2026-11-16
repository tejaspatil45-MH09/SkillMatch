import { useState } from 'react'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateProposal } from '../../utils/validators'

export default function ProposalForm({ onSubmit, budgetHint }) {
  const [v, setV] = useState({ coverLetter: '', bidAmount: '', estimatedDays: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  async function submit(e) {
    e.preventDefault()
    const errs = validateProposal(v); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try { await onSubmit({ coverLetter: v.coverLetter.trim(), bidAmount: Number(v.bidAmount), estimatedDays: Number(v.estimatedDays) }) } finally { setLoading(false) }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Input multiline label="Cover letter" value={v.coverLetter} onChange={set('coverLetter')} error={errors.coverLetter} hint="Explain why you are a good fit and how you would approach the project." />
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="Bid amount (₹)" type="number" inputMode="numeric" min="1" value={v.bidAmount} onChange={set('bidAmount')} error={errors.bidAmount} hint={budgetHint} />
        <Input label="Estimated completion (days)" type="number" inputMode="numeric" min="1" value={v.estimatedDays} onChange={set('estimatedDays')} error={errors.estimatedDays} />
      </div>
      <Button type="submit" loading={loading} size="lg">Submit proposal</Button>
    </form>
  )
}
