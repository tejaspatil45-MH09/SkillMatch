import { ShieldCheck, EyeOff, Clock, Ban } from 'lucide-react'
import { StatusBadge } from '../ui/Badge'
import { formatDate, timeUntil } from '../../utils/formatters'

const ICONS = { AVAILABLE: ShieldCheck, VIEWED: EyeOff, EXPIRED: Clock, DENIED: Ban }
export function demoMessage(demo) {
  if (demo.status === 'AVAILABLE') return `Demo expires in ${timeUntil(demo.expiresAt) ?? 'moments'}`
  if (demo.status === 'VIEWED') return `Demo viewed on ${formatDate(demo.viewedAt)}`
  if (demo.status === 'EXPIRED') return 'Demo expired. The 24-hour window has ended.'
  return 'Access denied'
}
export default function DemoStatus({ demo }) {
  const Icon = ICONS[demo.status] ?? Ban
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3.5">
      <span className="flex items-center gap-2.5 text-slate-700"><Icon className="size-5 text-slate-500" aria-hidden />{demoMessage(demo)}</span>
      <StatusBadge status={demo.status} />
    </div>
  )
}
