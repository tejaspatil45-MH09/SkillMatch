import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateRevision } from '../../utils/validators'

export default function RequestRevisionModal({ open, onClose, freelancerName, onConfirm }) {
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    const errs = validateRevision({ feedback }); if (errs.feedback) return setError(errs.feedback)
    setSaving(true)
    try { await onConfirm(feedback.trim()) } catch (err) { setError(err.fields?.feedback?.[0] ?? err.message); setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Request a revision">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>{freelancerName} will be notified and can submit a new version. Earlier versions stay in the history.</p>
        <Input multiline label="What needs to change?" value={feedback} onChange={(e) => { setFeedback(e.target.value); setError('') }} error={error} maxLength={1000} hint="Be specific so the next version can address it (at least 10 characters)." />
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Request revision</Button></div>
      </form>
    </Modal>
  )
}
