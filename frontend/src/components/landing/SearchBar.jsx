import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import Button from '../ui/Button'

const POPULAR = ['React', 'Node.js', 'Python', 'UI/UX Design', 'PostgreSQL']

export default function SearchBar() {
  const [mode, setMode] = useState('projects')
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  // Project browsing needs an account; the route guard sends visitors to log in and back.
  const submit = (e) => { e.preventDefault(); navigate(mode === 'projects' ? `/projects${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}` : '/login') }
  return (
    <div className="mx-auto max-w-2xl">
      <div role="group" aria-label="Search type" className="mb-3 inline-flex rounded-lg bg-slate-100 p-1">
        {[['projects', 'Projects'], ['freelancers', 'Freelancers']].map(([v, l]) => (
          <button key={v} aria-pressed={mode === v} onClick={() => setMode(v)}
            className={clsx('rounded-md px-4 py-1.5 font-medium', mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input aria-label={mode === 'projects' ? 'Search projects' : 'Search freelancers'} value={q} onChange={(e) => setQ(e.target.value)} disabled={mode === 'freelancers'}
            placeholder={mode === 'projects' ? 'Search by title or skill, e.g. React' : 'Companies can search freelancers after signing in'}
            className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50" />
        </div>
        <Button type="submit" size="lg">{mode === 'projects' ? 'Search projects' : 'Log in to search'}</Button>
      </form>
      {mode === 'projects' && (
        <p className="mt-3 text-xs text-slate-500">Popular: {POPULAR.map((s, i) => (
          <span key={s}><button type="button" onClick={() => navigate(`/projects?skills=${encodeURIComponent(s)}`)} className="font-medium text-slate-700 hover:text-brand-600">{s}</button>{i < POPULAR.length - 1 && ', '}</span>))}</p>
      )}
    </div>
  )
}
