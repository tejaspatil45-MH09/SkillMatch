import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
export default function Logo({ to = '/' }) {
  return (
    <Link to={to} className="flex items-center gap-2 text-lg font-bold text-slate-900">
      <span className="rounded-lg bg-brand-600 p-1.5 text-white"><Sparkles className="size-4" aria-hidden /></span>SkillMatch
    </Link>
  )
}
