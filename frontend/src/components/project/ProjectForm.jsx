import { useState } from 'react'
import { Lock } from 'lucide-react'
import clsx from 'clsx'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateProject } from '../../utils/validators'
import { toDateInput } from '../../utils/formatters'

export default function ProjectForm({ initial, allSkills, lockSkills, submitLabel, onSubmit, onCancel }) {
  const [v, setV] = useState({ title: initial?.title ?? '', description: initial?.description ?? '', budgetMin: String(initial?.budgetMin ?? ''), budgetMax: String(initial?.budgetMax ?? ''), deadline: initial ? toDateInput(initial.deadline) : '' })
  const [skills, setSkills] = useState(initial?.skills ?? [])
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  const toggle = (s) => { setSkills((c) => (c.includes(s) ? c.filter((x) => x !== s) : [...c, s])); setErrors((x) => ({ ...x, skills: undefined })) }
  async function submit(e) {
    e.preventDefault()
    const errs = validateProject({ ...v, skills }); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try { await onSubmit({ title: v.title.trim(), description: v.description.trim(), budgetMin: Number(v.budgetMin), budgetMax: Number(v.budgetMax), deadline: new Date(v.deadline + 'T23:59:59').toISOString(), skills }) } finally { setLoading(false) }
  }
  const tomorrow = toDateInput(new Date(Date.now() + 864e5))
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Input label="Project title" value={v.title} onChange={set('title')} error={errors.title} placeholder="e.g. Inventory management dashboard" />
      <Input multiline label="Description" value={v.description} onChange={set('description')} error={errors.description} hint="Describe the goals, deliverables, and anything freelancers should know." />
      <div className="grid gap-5 sm:grid-cols-3">
        <Input label="Minimum budget (₹)" type="number" min="1" value={v.budgetMin} onChange={set('budgetMin')} error={errors.budgetMin} />
        <Input label="Maximum budget (₹)" type="number" min="1" value={v.budgetMax} onChange={set('budgetMax')} error={errors.budgetMax} />
        <Input label="Deadline" type="date" min={tomorrow} value={v.deadline} onChange={set('deadline')} error={errors.deadline} />
      </div>
      <fieldset>
        <legend className="mb-1.5 font-medium text-slate-700">Required skills</legend>
        {lockSkills && <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500"><Lock className="size-3.5" aria-hidden />Skills are locked because this project already has proposals.</p>}
        <div className="flex flex-wrap gap-2">
          {allSkills.map((s) => <button type="button" key={s.id} disabled={lockSkills} onClick={() => toggle(s.name)} aria-pressed={skills.includes(s.name)}
            className={clsx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset disabled:cursor-not-allowed', skills.includes(s.name) ? 'bg-brand-600 text-white ring-brand-600 disabled:opacity-70' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50 disabled:opacity-40')}>{s.name}</button>)}
        </div>
        {errors.skills && <p role="alert" className="mt-1.5 text-xs text-red-600">{errors.skills}</p>}
      </fieldset>
      <div className="flex gap-3"><Button type="submit" loading={loading}>{submitLabel}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </form>
  )
}
