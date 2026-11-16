import { useState } from 'react'
import clsx from 'clsx'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateProfile } from '../../utils/validators'

export default function EditProfileModal({ open, onClose, profile, allSkills, onSave }) {
  const p = profile.profile
  const [v, setV] = useState({ name: profile.name, headline: p.headline ?? '', location: p.location ?? '', experienceYears: String(p.experienceYears ?? ''), bio: p.bio ?? '' })
  const [skills, setSkills] = useState(p.skills)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  const toggle = (s) => setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  async function save(e) {
    e.preventDefault()
    const errs = validateProfile(v); if (skills.length < 1) errs.skills = 'Select at least one skill.'
    setErrors(errs); if (Object.keys(errs).length) return
    setSaving(true)
    try { await onSave({ name: v.name.trim(), profile: { headline: v.headline.trim(), location: v.location.trim(), experienceYears: Number(v.experienceYears), bio: v.bio.trim(), skills } }) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit profile" wide>
      <form onSubmit={save} noValidate className="space-y-4">
        <Input label="Full name" value={v.name} onChange={set('name')} error={errors.name} />
        <Input label="Headline" value={v.headline} onChange={set('headline')} error={errors.headline} placeholder="e.g. Full-stack developer" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Location" value={v.location} onChange={set('location')} placeholder="City, State" />
          <Input label="Years of experience" type="number" min="0" value={v.experienceYears} onChange={set('experienceYears')} error={errors.experienceYears} />
        </div>
        <Input multiline label="Bio" value={v.bio} onChange={set('bio')} error={errors.bio} />
        <fieldset><legend className="mb-1.5 font-medium text-slate-700">Skills</legend>
          <div className="flex flex-wrap gap-2">{allSkills.map((s) => <button type="button" key={s.id} onClick={() => toggle(s.name)} aria-pressed={skills.includes(s.name)}
            className={clsx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', skills.includes(s.name) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s.name}</button>)}</div>
          {errors.skills && <p role="alert" className="mt-1.5 text-xs text-red-600">{errors.skills}</p>}
        </fieldset>
        <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Save changes</Button></div>
      </form>
    </Modal>
  )
}
