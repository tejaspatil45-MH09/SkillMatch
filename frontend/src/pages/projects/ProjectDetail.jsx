import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, Globe, MapPin, Star, Wallet } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Avatar from '../../components/ui/Avatar'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import { StatusBadge } from '../../components/ui/Badge'
import SkillsList from '../../components/profile/SkillsList'
import SkillMatchBadge from '../../components/project/SkillMatchBadge'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { projectService } from '../../services/projectService'
import { useReport } from '../../hooks/useReport'
import { budgetRange, formatDate } from '../../utils/formatters'

const Fact = ({ icon: Icon, label, children }) => <div><dt className="flex items-center gap-1.5 text-xs text-slate-500"><Icon className="size-4 text-slate-400" aria-hidden />{label}</dt><dd className="mt-0.5 font-medium text-slate-900">{children}</dd></div>

export default function ProjectDetail() {
  const { projectId } = useParams()
  const { user } = useAuth()
  const report = useReport({ targetType: 'PROJECT', targetId: projectId, label: 'this project' })
  const { data: p, error, reload } = useAsync(() => projectService.getProject(projectId), [projectId])
  if (error) return <div><Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to projects</Link><ErrorState message={error.status === 404 ? 'This project could not be found.' : error.message} onRetry={error.status === 404 ? undefined : reload} /></div>
  if (!p) return <LoadingSpinner label="Loading project" />
  const mine = user.role === 'FREELANCER' ? user.profile.skills : []
  const missing = p.skills.filter((s) => !mine.map((x) => x.toLowerCase()).includes(s.toLowerCase()))
  return (
    <div>
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back to projects</Link>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold text-slate-900">{p.title}</h1><p className="mt-1 text-slate-500">Posted by {p.company.name} on {formatDate(p.createdAt)}</p></div><StatusBadge status={p.status} /></div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-3"><Fact icon={Wallet} label="Budget">{budgetRange(p)}</Fact><Fact icon={CalendarClock} label="Deadline">{formatDate(p.deadline)}</Fact><Fact icon={CalendarClock} label="Posted">{formatDate(p.createdAt)}</Fact></dl>
            <h2 className="mb-2 mt-8 font-semibold text-slate-900">Description</h2><p className="whitespace-pre-line text-slate-700">{p.description}</p>
            <h2 className="mb-2 mt-8 font-semibold text-slate-900">Required skills</h2><SkillsList skills={p.skills} highlight={mine} />
            {user.role === 'FREELANCER' && missing.length > 0 && <p className="mt-3 text-xs text-slate-500">Skills not on your profile: {missing.join(', ')}</p>}
          </Card>
        </div>
        <div className="space-y-6">
          {user.role === 'FREELANCER' && (
            <Card className="p-6">
              <div className="flex items-center justify-between"><p className="font-semibold text-slate-900">Your skill match</p><SkillMatchBadge value={p.skillMatch} /></div>
              <div className="mt-5">
                {p.hasApplied ? <>
                  <Button disabled className="w-full">Proposal Submitted</Button>
                  <Button as={Link} to={`/freelancer/proposals/${p.proposalId}`} variant="ghost" className="mt-2 w-full">View your proposal</Button></>
                  : p.status === 'OPEN' ? <Button as={Link} to={`/projects/${p.id}/proposal`} className="w-full">Submit Proposal</Button>
                  : <p className="rounded-lg bg-slate-50 p-3 text-slate-600">This project is no longer accepting proposals.</p>}
              </div>
            </Card>)}
          {user.role === 'FREELANCER' && <div className="flex justify-end">{report.button}</div>}
          <Card className="p-6">
            <h2 className="mb-4 font-semibold text-slate-900">About the company</h2>
            <div className="flex items-center gap-3"><Avatar name={p.company.name} /><div>{user.role === 'FREELANCER' ? <Link to={`/companies/${p.company.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.company.name}</Link> : <p className="font-medium text-slate-900">{p.company.name}</p>}{p.company.industry && <p className="text-slate-500">{p.company.industry}</p>}</div></div>
            {p.company.description && <p className="mt-4 text-slate-600">{p.company.description}</p>}
            <ul className="mt-4 space-y-2 text-slate-600">
              {p.company.location && <li className="flex items-center gap-2"><MapPin className="size-4 text-slate-400" aria-hidden />{p.company.location}</li>}
              {p.company.website && <li className="flex items-center gap-2"><Globe className="size-4 text-slate-400" aria-hidden /><a href={p.company.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">{p.company.website.replace(/^https?:\/\//, '')}</a></li>}
              {p.company.rating && <li className="flex items-center gap-2"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{p.company.rating} ({p.company.reviewCount} reviews)</li>}
            </ul>
          </Card>
        </div>
      </div>
      {report.modal}
    </div>
  )
}
