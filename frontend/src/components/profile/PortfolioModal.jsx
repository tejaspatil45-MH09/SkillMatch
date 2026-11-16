import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validatePortfolio } from '../../utils/validators'

export default function PortfolioModal({ open, onClose, onSave }) {
  const [v, setV] = useState({ title: '', description: '', url: '' })
  const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  async function save(e) {
    e.preventDefault(); const errs = validatePortfolio(v); setErrors(errs); if (Object.keys(errs).length) return
    setSaving(true); try { await onSave({ title: v.title.trim(), description: v.description.trim(), url: v.url.trim(), image: null }) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add portfolio project">
      <form onSubmit={save} noValidate className="space-y-4">
        <Input label="Title" value={v.title} onChange={set('title')} error={errors.title} />
        <Input multiline label="Description" value={v.description} onChange={set('description')} error={errors.description} />
        <Input label="Project URL (optional)" value={v.url} onChange={set('url')} error={errors.url} placeholder="https://" />
        <div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Add project</Button></div>
      </form>
    </Modal>
  )
}
