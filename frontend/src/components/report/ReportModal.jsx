import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function ReportModal({ open, onClose, targetLabel, onSubmit }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (reason.trim().length < 20) return setError(`Please explain the problem (at least 20 characters, ${reason.trim().length}/20).`)
    setSaving(true); try { await onSubmit(reason.trim()) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title={`Report ${targetLabel}`}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p>Tell our team what's wrong. Reports are reviewed by a SkillMatch administrator.</p>
        <Input multiline label="What happened?" value={reason} onChange={(e) => { setReason(e.target.value); setError('') }} error={error} />
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Send report</Button></div>
      </form>
    </Modal>
  )
}
