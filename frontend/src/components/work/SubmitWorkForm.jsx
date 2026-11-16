import { useState } from 'react'
import { Send } from 'lucide-react'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { validateSubmission } from '../../utils/validators'

// Server field errors arrive as { field: [messages] }; show the first message of each
const fromServer = (fields = {}) => Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]))

// `initial` pre-fills a revision with the previous version's details, so only what changed needs editing.
// `onSubmit` must throw on failure (the form shows the server's message) and resolve on success.
export default function SubmitWorkForm({ onSubmit, initial, isRevision }) {
  const [v, setV] = useState({ title: initial?.title ?? '', repoUrl: initial?.repoUrl ?? '', liveUrl: initial?.liveUrl ?? '', description: initial?.description ?? '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setErrors((x) => ({ ...x, [k]: undefined })); setFormError('') }

  async function submit(e) {
    e.preventDefault()
    const errs = validateSubmission(v); setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true); setFormError('')
    try { await onSubmit({ title: v.title.trim(), repoUrl: v.repoUrl.trim(), liveUrl: v.liveUrl.trim(), description: v.description.trim() }) }
    catch (err) { setErrors(fromServer(err.fields)); setFormError(err.message) }
    finally { setLoading(false) }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{formError}</p>}
      <Input label="Title" value={v.title} onChange={set('title')} error={errors.title} maxLength={120} placeholder={isRevision ? 'e.g. Revised build with fixes' : 'e.g. Final delivery'} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="GitHub repository (optional)" type="url" inputMode="url" value={v.repoUrl} onChange={set('repoUrl')} error={errors.repoUrl} placeholder="https://github.com/owner/repository" />
        <Input label="Live demo link (optional)" type="url" inputMode="url" value={v.liveUrl} onChange={set('liveUrl')} error={errors.liveUrl} placeholder="https://" />
      </div>
      <Input multiline label="Completion notes" value={v.description} onChange={set('description')} error={errors.description} maxLength={5000}
        hint="What was delivered, how to run or test it, and anything the company should know. Required if you do not add a link (at least 20 characters)." />
      <p className="text-xs text-slate-500">File attachments are not available yet: share files through your repository or a hosted link.</p>
      <Button type="submit" loading={loading} size="lg"><Send className="size-4" aria-hidden />{isRevision ? 'Submit revision' : 'Submit work'}</Button>
    </form>
  )
}
