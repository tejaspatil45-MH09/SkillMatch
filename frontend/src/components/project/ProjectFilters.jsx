import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import clsx from 'clsx'
import Select from '../ui/Select'
import Button from '../ui/Button'

export const BUDGETS = { any: ['Any budget', {}], low: ['Under ₹20,000', { maxBudget: 20000 }], mid: ['₹20,000 - ₹40,000', { minBudget: 20000, maxBudget: 40000 }], high: ['Above ₹40,000', { minBudget: 40000 }] }
export const DEADLINES = { any: 'Any deadline', 14: 'Within 2 weeks', 30: 'Within 1 month', 60: 'Within 2 months' }
export const SORTS = [['match', 'Best match'], ['newest', 'Newest'], ['budget', 'Highest budget'], ['deadline', 'Nearest deadline']]

// Controlled by URL params so filtered views are shareable and survive refresh
export default function ProjectFilters({ values, skills, canMatch, onChange, onReset }) {
  const [open, setOpen] = useState(false)
  const selected = values.skills
  const toggle = (name) => onChange({ skills: selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name] })
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input aria-label="Search projects" value={values.q} onChange={(e) => onChange({ q: e.target.value })} placeholder="Search by title or description"
          className="h-10 w-full rounded-lg border border-slate-300 pl-10 pr-3 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select label="Budget" value={values.budget} onChange={(e) => onChange({ budget: e.target.value })} options={Object.entries(BUDGETS).map(([k, [l]]) => [k, l])} />
        <Select label="Deadline" value={values.deadline} onChange={(e) => onChange({ deadline: e.target.value })} options={Object.entries(DEADLINES)} />
        <Select label="Sort by" value={values.sort} onChange={(e) => onChange({ sort: e.target.value })} options={canMatch ? SORTS : SORTS.slice(1)} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 font-medium text-slate-700 hover:text-slate-900">
          <SlidersHorizontal className="size-4" aria-hidden />Skills{selected.length > 0 && <span className="rounded-full bg-brand-600 px-2 text-xs text-white">{selected.length}</span>}
        </button>
        <Button variant="ghost" size="sm" onClick={onReset}>Clear filters</Button>
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3" role="group" aria-label="Filter by skill">
          {skills.map((s) => <button key={s.id} onClick={() => toggle(s.name)} aria-pressed={selected.includes(s.name)}
            className={clsx('rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset', selected.includes(s.name) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{s.name}</button>)}
        </div>
      )}
    </div>
  )
}
