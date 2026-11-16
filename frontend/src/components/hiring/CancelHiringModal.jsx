import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function CancelHiringModal({ open, onClose, hiring, onConfirm }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (reason.trim().length < 10) return setError('Tell the freelancer why (at least 10 characters).')
    setSaving(true); try { await onConfirm(reason.trim()) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Cancel this hiring?">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>{hiring.freelancer.name} will be notified and "{hiring.project.title}" will be marked Cancelled. This can't be undone.</p>
        <Input multiline label="Reason" value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} error={error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Keep hiring</Button><Button type="submit" variant="danger" loading={saving}>Cancel hiring</Button></div>
      </form>
    </Modal>
  )
}
