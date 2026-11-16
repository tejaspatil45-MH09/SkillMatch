import { Link } from 'react-router-dom'
import { CalendarClock, MapPin, Wallet } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Badge from '../ui/Badge'
import Avatar from '../ui/Avatar'
import SkillsList from '../profile/SkillsList'
import SkillMatchBadge from './SkillMatchBadge'
import { budgetRange, formatDate, timeAgo } from '../../utils/formatters'

export default function ProjectCard({ project: p, mySkills, headingLevel: H = 'h2' }) {
  return (
    <Card className="flex flex-col p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.company.name} size="sm" />
          <div className="min-w-0"><H className="truncate font-semibold text-slate-900">{p.title}</H><p className="truncate text-slate-500">{p.company.name}</p></div>
        </div>
        {p.skillMatch !== undefined && <SkillMatchBadge value={p.skillMatch} />}
      </div>
      <p className="mt-3 line-clamp-2 text-slate-600">{p.description}</p>
      <div className="mt-4"><SkillsList skills={p.skills} highlight={mySkills} /></div>
      <dl className="mt-4 grid gap-2 text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2"><Wallet className="size-4 text-slate-400" aria-hidden /><dt className="sr-only">Budget</dt><dd>{budgetRange(p)}</dd></div>
        <div className="flex items-center gap-2"><CalendarClock className="size-4 text-slate-400" aria-hidden /><dt className="sr-only">Deadline</dt><dd>Due {formatDate(p.deadline)}</dd></div>
        {p.company.location && <div className="flex items-center gap-2"><MapPin className="size-4 text-slate-400" aria-hidden /><dt className="sr-only">Location</dt><dd>{p.company.location}</dd></div>}
      </dl>
      <div className="mt-5 flex flex-1 items-end justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">Posted {timeAgo(p.createdAt)}{p.hasApplied && <Badge className="bg-indigo-50 text-indigo-700">Proposal submitted</Badge>}</div>
        <Button as={Link} to={`/projects/${p.id}`} size="sm" variant="secondary">View Project</Button>
      </div>
    </Card>
  )
}
