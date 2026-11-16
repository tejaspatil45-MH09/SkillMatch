import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateDemo } from '../../utils/validators'

export default function DemoSubmitForm({ onSubmit }) {
  const [v, setV] = useState({ url: '', description: '' })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })) }
  async function submit(e) {
    e.preventDefault()
    const errs = validateDemo(v); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try { await onSubmit({ url: v.url.trim(), description: v.description.trim() }) } finally { setLoading(false) }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="flex gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-indigo-900">
        <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div><p className="font-medium">Your demo will only be accessible to the company associated with this project.</p>
          <p className="mt-1 text-xs text-indigo-800">The company can open it once, within 24 hours of submission. After that, access closes. You can issue a new window later if needed.</p></div>
      </div>
      <Input label="Demo URL" type="url" inputMode="url" value={v.url} onChange={set('url')} error={errors.url} placeholder="https://" hint="A link the company can open, such as a hosted app, video, or prototype." />
      <Input multiline label="Demo description" value={v.description} onChange={set('description')} error={errors.description} hint="Explain what the company will see and anything they need to know (test logins, steps to try)." />
      <Button type="submit" loading={loading} size="lg">Submit demo</Button>
    </form>
  )
}
