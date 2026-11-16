import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateCompany } from '../../utils/validators'

export default function EditCompanyModal({ open, onClose, profile, onSave }) {
  const p = profile.profile
  const [v, setV] = useState({ name: profile.name, industry: p.industry ?? '', location: p.location ?? '', website: p.website ?? '', description: p.description ?? '' })
  const [errors, setErrors] = useState({}); const [saving, setSaving] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  async function save(e) {
    e.preventDefault(); const errs = validateCompany(v); setErrors(errs); if (Object.keys(errs).length) return
    setSaving(true)
    try { await onSave({ name: v.name.trim(), profile: { industry: v.industry.trim(), location: v.location.trim(), website: v.website.trim(), description: v.description.trim() } }) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit company profile" wide>
      <form onSubmit={save} noValidate className="space-y-4">
        <Input label="Company name" value={v.name} onChange={set('name')} error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2"><Input label="Industry" value={v.industry} onChange={set('industry')} /><Input label="Location" value={v.location} onChange={set('location')} placeholder="City, State" /></div>
        <Input label="Website" value={v.website} onChange={set('website')} error={errors.website} placeholder="https://" />
        <Input multiline label="Description" value={v.description} onChange={set('description')} error={errors.description} />
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </Modal>
  )
}
