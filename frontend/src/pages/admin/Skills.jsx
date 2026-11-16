import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { adminService } from '../../services/adminService'

export default function Skills() {
  const toast = useToast()
  const { data, error, reload } = useAsync(() => adminService.getSkills(), [])
  const [name, setName] = useState(''); const [formError, setFormError] = useState('')
  const [adding, setAdding] = useState(false); const [target, setTarget] = useState(null); const [busy, setBusy] = useState(false)
  if (error) return <ErrorState message={error.message} onRetry={reload} />

  async function add(e) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 2) return setFormError('Enter a skill name (at least 2 characters).')
    if (n.length > 40) return setFormError('Keep skill names under 40 characters.')
    setAdding(true)
    try { await adminService.addSkill(n); toast(`"${n}" added.`); setName(''); reload() } catch (err) { setFormError(err.message) } finally { setAdding(false) }
  }
  async function remove() {
    setBusy(true)
    try { await adminService.deleteSkill(target.id); toast(`"${target.name}" removed.`); setTarget(null); reload() } catch (e) { toast(e.message, 'error'); setTarget(null) } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title="Skills" description="The skills freelancers can add and companies can require." />
      <Card className="mb-6 p-5">
        <form onSubmit={add} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Input className="flex-1" aria-label="New skill name" value={name} onChange={(e) => { setName(e.target.value); setFormError('') }} error={formError} placeholder="e.g. GraphQL" />
          <Button type="submit" loading={adding} className="sm:mt-0"><Plus className="size-4" aria-hidden />Add skill</Button>
        </form>
      </Card>
      {!data ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : <>
        <p className="mb-3 text-slate-500">{data.length} skills</p>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div><p className="font-medium text-slate-900">{s.name}</p><p className="text-xs text-slate-500">Used {s.usage} {s.usage === 1 ? 'time' : 'times'}</p></div>
              <Button variant="ghost" size="sm" aria-label={`Remove ${s.name}`} onClick={() => setTarget(s)}><X className="size-4" /></Button>
            </li>))}
        </ul></>}
      <ConfirmDialog open={!!target} danger loading={busy} onClose={() => setTarget(null)} onConfirm={remove} title="Remove this skill?" confirmLabel="Remove"
        message={target && (target.usage > 0 ? `"${target.name}" is used ${target.usage} ${target.usage === 1 ? 'time' : 'times'}. Existing projects and profiles keep it, but it will no longer be offered when choosing skills.` : `"${target.name}" isn't used anywhere and will be removed.`)} />
    </div>
  )
}
