import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, Clock, FolderOpen, MapPin, Star, Wallet } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import { StatusBadge } from '../ui/Badge'
import SkillsList from '../profile/SkillsList'
import SkillMatchBadge from '../project/SkillMatchBadge'
import DemoStatus from '../demo/DemoStatus'
import { formatDate, formatINR } from '../../utils/formatters'

// Company's view of one proposal. Actions are hidden unless the project is still open.
export default function ProposalCard({ proposal: p, projectSkills, projectOpen, onShortlist, onReject, onAccept, busy }) {
  const [expanded, setExpanded] = useState(false)
  const f = p.freelancer, long = p.coverLetter.length > 220
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 gap-3">
          <Avatar name={f.name} src={f.photo} />
          <div className="min-w-0">
            <Link to={`/freelancers/${f.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{f.name}</Link>
            <p className="text-slate-600">{f.headline}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              {f.location && <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{f.location}</span>}
              <span className="flex items-center gap-1"><Briefcase className="size-3.5" aria-hidden />{f.experienceYears} yrs experience</span>
              {f.rating && <span className="flex items-center gap-1"><Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />{f.rating} ({f.reviewCount})</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end"><SkillMatchBadge value={p.skillMatch} /><StatusBadge status={p.status} /></div>
      </div>
      <div className="mt-4"><SkillsList skills={f.skills} highlight={projectSkills} /></div>
      <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3.5 sm:grid-cols-3">
        <div><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Wallet className="size-4 text-slate-400" aria-hidden />Bid</dt><dd className="mt-0.5 font-medium text-slate-900">{formatINR(p.bidAmount)}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Clock className="size-4 text-slate-400" aria-hidden />Estimated time</dt><dd className="mt-0.5 font-medium text-slate-900">{p.estimatedDays} days</dd></div>
        <div><dt className="flex items-center gap-1.5 text-xs text-slate-500"><FolderOpen className="size-4 text-slate-400" aria-hidden />Portfolio</dt><dd className="mt-0.5 font-medium text-slate-900">{f.portfolio.length} {f.portfolio.length === 1 ? 'project' : 'projects'}</dd></div>
      </dl>
      <div className="mt-4">
        <p className="text-xs font-medium text-slate-500">Cover letter · submitted {formatDate(p.createdAt)}</p>
        <p className={`mt-1 whitespace-pre-line text-slate-700 ${expanded ? '' : 'line-clamp-3'}`}>{p.coverLetter}</p>
        {long && <button onClick={() => setExpanded((e) => !e)} className="mt-1 font-medium text-brand-600 hover:text-brand-700">{expanded ? 'Show less' : 'Read more'}</button>}
      </div>
      {['SHORTLISTED', 'ACCEPTED'].includes(p.status) && (
        <div className="mt-4 space-y-2">
          {p.demo ? <><DemoStatus demo={p.demo} />{p.demo.status === 'AVAILABLE' && <Button as={Link} to={`/company/proposals/${p.id}/demo`} variant="secondary" size="sm">View Demo</Button>}</>
            : p.status === 'SHORTLISTED' && <p className="rounded-lg bg-slate-50 p-3 text-slate-600">Waiting for the freelancer to submit a demo.</p>}
        </div>)}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {projectOpen && p.status === 'PENDING' && <Button size="sm" loading={busy} onClick={() => onShortlist(p)}>Shortlist</Button>}
        {projectOpen && p.status === 'SHORTLISTED' && <Button size="sm" loading={busy} onClick={() => onAccept(p)}>Accept and hire</Button>}
        {projectOpen && ['PENDING', 'SHORTLISTED'].includes(p.status) && <Button size="sm" variant="secondary" disabled={busy} onClick={() => onReject(p)}>Reject</Button>}
        <Button as={Link} to={`/freelancers/${f.id}`} size="sm" variant="ghost">View Profile</Button>
      </div>
    </Card>
  )
}
