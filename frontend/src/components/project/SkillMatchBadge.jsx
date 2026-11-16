import clsx from 'clsx'
// Colour thresholds are a UI hint only; the percentage itself comes from the API.
export default function SkillMatchBadge({ value }) {
  const tone = value >= 75 ? 'bg-green-50 text-green-700' : value >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
  return <div className={clsx('shrink-0 rounded-lg px-3 py-1.5 text-center', tone)} aria-label={`Skill match ${value} percent`}><p className="text-lg font-bold leading-none">{value}%</p><p className="mt-0.5 text-[11px] font-medium">Skill match</p></div>
}
