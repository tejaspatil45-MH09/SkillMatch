import { ExternalLink, GitBranch, Globe } from 'lucide-react'
import Card from '../ui/Card'
import { StatusBadge } from '../ui/Badge'
import { formatDateTime } from '../../utils/formatters'
import { isSafeUrl } from '../../utils/validators'

const STATUS_TEXT = { SUBMITTED: 'Waiting for review', APPROVED: 'Approved', REVISION_REQUESTED: 'Revision requested' }

// External links open in a new tab, never as anything but plain http(s), and without leaking the opener
function Link({ href, icon: Icon, children }) {
  if (!isSafeUrl(href)) return null
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-brand-700 ring-1 ring-slate-300 hover:bg-slate-50"><Icon className="size-4" aria-hidden />{children}<ExternalLink className="size-3.5 text-slate-500" aria-hidden /><span className="sr-only">(opens in a new tab)</span></a>
}

export default function SubmissionCard({ s, current, children }) {
  return (
    <Card className={current ? 'border-brand-600/40 p-5 ring-1 ring-brand-600/20' : 'p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Version {s.version}{current && ' · latest'}</p>
          <h3 className="mt-0.5 font-semibold text-slate-900">{s.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Submitted {formatDateTime(s.submittedAt)} by {s.submittedBy.name}</p>
        </div>
        <span title={STATUS_TEXT[s.status]}><StatusBadge status={s.status} /></span>
      </div>
      {(s.repoUrl || s.liveUrl) && <div className="mt-4 flex flex-wrap gap-2"><Link href={s.repoUrl} icon={GitBranch}>Repository</Link><Link href={s.liveUrl} icon={Globe}>Live demo</Link></div>}
      {s.description && <p className="mt-4 whitespace-pre-wrap break-words text-slate-700">{s.description}</p>}
      {s.feedback && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Company feedback{s.reviewedAt && ` · ${formatDateTime(s.reviewedAt)}`}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-amber-900">{s.feedback}</p>
        </div>)}
      {s.status === 'APPROVED' && s.reviewedAt && <p className="mt-4 text-xs text-green-700">Approved {formatDateTime(s.reviewedAt)}</p>}
      {children}
    </Card>
  )
}
