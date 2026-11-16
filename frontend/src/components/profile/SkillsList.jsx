import clsx from 'clsx'
// `highlight` marks skills the viewer has (used on project cards)
export default function SkillsList({ skills = [], highlight, max }) {
  const have = highlight && new Set(highlight.map((s) => s.toLowerCase()))
  const shown = max ? skills.slice(0, max) : skills
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((s) => <li key={s} className={clsx('rounded-md px-2.5 py-1 text-xs font-medium', have?.has(s.toLowerCase()) ? 'bg-green-50 text-green-700 ring-1 ring-green-600/20' : 'bg-slate-100 text-slate-700')}>{s}</li>)}
      {max && skills.length > max && <li className="px-1 py-1 text-xs text-slate-500">+{skills.length - max} more</li>}
    </ul>
  )
}
