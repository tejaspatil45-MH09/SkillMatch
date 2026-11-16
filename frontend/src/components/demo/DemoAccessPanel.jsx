import { Ban, Clock, EyeOff, ExternalLink, FileQuestion, ShieldCheck } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { StatusBadge } from '../ui/Badge'
import { useCountdown } from '../../hooks/useCountdown'
import { timeUntil } from '../../utils/formatters'
import { isSafeUrl } from '../../utils/validators'

// Presentational. The server decides access; this only reflects the state it reports.
// `revealed` holds the URL returned by the single successful access call (never fetched elsewhere).
export default function DemoAccessPanel({ demo, denied, revealed, onView, viewing }) {
  const remaining = useCountdown(demo?.expiresAt)
  let state = denied ? 'DENIED' : !demo ? 'NONE' : revealed ? 'REVEALED' : demo.status
  if (state === 'AVAILABLE' && remaining === 0) state = 'EXPIRED'   // window closed while the page was open

  const view = {
    AVAILABLE: { icon: ShieldCheck, tone: 'text-green-600 bg-green-50', title: 'Demo available', text: `Demo expires in ${timeUntil(demo?.expiresAt) ?? 'moments'}. You can view it once.` },
    REVEALED: { icon: EyeOff, tone: 'text-slate-600 bg-slate-100', title: 'Demo Viewed', text: 'Access to this demo has been consumed.' },
    VIEWED: { icon: EyeOff, tone: 'text-slate-600 bg-slate-100', title: 'Demo Already Viewed', text: 'Access to this demo has been consumed. A demo can be viewed only once.' },
    EXPIRED: { icon: Clock, tone: 'text-amber-600 bg-amber-50', title: 'Demo Expired', text: 'No access is available because the 24-hour access window has expired.' },
    DENIED: { icon: Ban, tone: 'text-red-600 bg-red-50', title: 'Access Denied', text: "You don't have permission to access this demo. Only the company that owns the project can open it." },
    NONE: { icon: FileQuestion, tone: 'text-slate-600 bg-slate-100', title: 'No demo yet', text: "The freelancer hasn't submitted a demo for this proposal yet." },
  }[state]
  const Icon = view.icon
  const badge = { AVAILABLE: 'AVAILABLE', REVEALED: 'VIEWED', VIEWED: 'VIEWED', EXPIRED: 'EXPIRED', DENIED: 'DENIED' }[state]

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex gap-4">
          <span className={`h-fit rounded-xl p-3 ${view.tone}`}><Icon className="size-6" aria-hidden /></span>
          <div role="status"><h2 className="text-lg font-semibold text-slate-900">{view.title}</h2><p className="mt-1 text-slate-600">{view.text}</p></div>
        </div>
        {badge && <StatusBadge status={badge} />}
      </div>

      {state === 'REVEALED' && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium text-slate-500">Freelancer's description</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{revealed.description}</p>
          {isSafeUrl(revealed.url)
            ? <Button as="a" href={revealed.url} target="_blank" rel="noopener noreferrer" className="mt-4"><ExternalLink className="size-4" aria-hidden />Open demo</Button>
            : <p className="mt-4 text-red-700">The demo link was not a valid web address, so it was not opened.</p>}
          <p className="mt-3 text-xs text-slate-500">Open it now. For security, this link is shown only once and will not be available after you leave this page.</p>
        </div>)}

      {!['NONE', 'DENIED'].includes(state) && (
        <div className="mt-6"><Button size="lg" onClick={onView} disabled={state !== 'AVAILABLE'} loading={viewing}>View Demo</Button></div>)}
    </Card>
  )
}
