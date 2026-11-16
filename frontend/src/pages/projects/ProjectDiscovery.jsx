import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import ProjectCard from '../../components/project/ProjectCard'
import ProjectFilters, { BUDGETS } from '../../components/project/ProjectFilters'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { useDebounce } from '../../hooks/useDebounce'
import { projectService } from '../../services/projectService'

export default function ProjectDiscovery() {
  const { user } = useAuth()
  const isFreelancer = user.role === 'FREELANCER'
  const [sp, setSp] = useSearchParams()
  const values = { q: sp.get('q') ?? '', skills: (sp.get('skills') ?? '').split(',').filter(Boolean), budget: sp.get('budget') ?? 'any', deadline: sp.get('deadline') ?? 'any', sort: sp.get('sort') ?? (isFreelancer ? 'match' : 'newest') }

  const update = (patch) => {
    const next = { ...values, ...patch }, params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.skills.length) params.set('skills', next.skills.join(','))
    if (next.budget !== 'any') params.set('budget', next.budget)
    if (next.deadline !== 'any') params.set('deadline', next.deadline)
    if (patch.sort || sp.get('sort')) params.set('sort', next.sort)
    setSp(params, { replace: true })
  }
  // Typing updates the box instantly; the URL (and API call) follows after a short pause
  const [qInput, setQInput] = useState(values.q)
  const dq = useDebounce(qInput)
  useEffect(() => { if (dq !== values.q) update({ q: dq }) }, [dq]) // eslint-disable-line react-hooks/exhaustive-deps
  const onChange = (patch) => ('q' in patch ? setQInput(patch.q) : update(patch))
  const reset = () => { setQInput(''); setSp({}, { replace: true }) }

  const key = sp.toString()
  const filters = useMemo(() => ({ q: values.q, skills: values.skills.join(','), ...BUDGETS[values.budget]?.[1], sort: values.sort,
    deadlineBefore: values.deadline === 'any' ? undefined : new Date(Date.now() + Number(values.deadline) * 864e5).toISOString() }), [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const { data, loading, error, reload } = useAsync(() => projectService.getProjects(filters), [key])
  const skills = useAsync(() => projectService.getSkills(), [])

  return (
    <div>
      <PageHeader title="Find projects" description={isFreelancer ? 'Open projects, ranked by how well they match your skills.' : 'Browse open projects on SkillMatch.'} />
      <ProjectFilters values={{ ...values, q: qInput }} skills={skills.data ?? []} canMatch={isFreelancer} onChange={onChange} onReset={reset} />
      {error ? <ErrorState message={error.message} onRetry={reload} /> : !data ? (
        <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Card key={i} className="space-y-3 p-5"><Skeleton className="h-5 w-1/2" /><Skeleton /><Skeleton className="h-4 w-2/3" /></Card>)}</div>
      ) : data.length === 0 ? (
        <EmptyState icon={SearchX} title="No projects match your filters" description="Try removing a filter or searching with different words." action={<Button variant="secondary" onClick={reset}>Clear filters</Button>} />
      ) : (
        <>
          <p className="mb-3 text-slate-500" aria-live="polite">{data.length} {data.length === 1 ? 'project' : 'projects'} found</p>
          <div className={`grid gap-4 lg:grid-cols-2 ${loading ? 'opacity-60' : ''}`}>{data.map((p) => <ProjectCard key={p.id} project={p} mySkills={isFreelancer ? user.profile.skills : undefined} />)}</div>
        </>
      )}
    </div>
  )
}
