import { Link } from 'react-router-dom'
import { Briefcase, CheckCircle2, FileClock, ListChecks, UserCheck } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import ProgressBar from '../../components/ui/ProgressBar'
import Card from '../../components/ui/Card'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import ProjectCard from '../../components/project/ProjectCard'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'
import { timeAgo } from '../../utils/formatters'

export default function Dashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(() => profileService.getFreelancerDashboard(), [])
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const d = data
  return (
    <div>
      <PageHeader title={`Welcome back, ${user.name.split(' ')[0]}`} description="Here's what's happening with your proposals and projects." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Profile completion" icon={UserCheck} loading={loading} value={d && `${d.profileCompletion}%`}>
          {d && <div className="mt-3"><ProgressBar value={d.profileCompletion} label="Profile completion" /></div>}
        </StatCard>
        <StatCard label="Active proposals" icon={FileClock} loading={loading} value={d?.activeProposals} />
        <StatCard label="Shortlisted" icon={ListChecks} loading={loading} value={d?.shortlisted} />
        <StatCard label="Active projects" icon={Briefcase} loading={loading} value={d?.activeProjects} />
        <StatCard label="Completed projects" icon={CheckCircle2} loading={loading} value={d?.completedProjects} />
      </div>
      {d && d.profileCompletion < 100 && <p className="mt-4 text-slate-600">Complete your profile to improve your matches. <Link to="/freelancer/profile" className="font-medium text-brand-600 hover:text-brand-700">Update profile</Link></p>}
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="opps">
          <div className="mb-3 flex items-center justify-between"><h2 id="opps" className="font-semibold text-slate-900">Skill match opportunities</h2><Link to="/projects" className="font-medium text-brand-600 hover:text-brand-700">Browse all</Link></div>
          <div className="space-y-4">
            {loading && [0, 1].map((i) => <Card key={i} className="space-y-3 p-5"><Skeleton className="h-5 w-1/2" /><Skeleton /><Skeleton className="h-4 w-2/3" /></Card>)}
            {d?.opportunities.map((p) => <ProjectCard key={p.id} project={p} mySkills={user.profile.skills} headingLevel="h3" />)}
            {d && !d.opportunities.length && <EmptyState title="No new opportunities" description="New projects that match your skills will appear here." action={<Button as={Link} to="/projects" variant="secondary">Browse projects</Button>} />}
          </div>
        </section>
        <section aria-labelledby="notifs">
          <div className="mb-3 flex items-center justify-between"><h2 id="notifs" className="font-semibold text-slate-900">Recent notifications</h2><Link to="/notifications" className="font-medium text-brand-600 hover:text-brand-700">View all</Link></div>
          <Card className="divide-y divide-slate-100">
            {loading && <div className="space-y-3 p-4"><Skeleton /><Skeleton /><Skeleton /></div>}
            {d?.notifications.map((n) => (
              <Link key={n.id} to={n.link} className="flex gap-3 p-4 hover:bg-slate-50">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} aria-label={n.read ? undefined : 'Unread'} />
                <div><p className="text-slate-700">{n.message}</p><p className="mt-0.5 text-xs text-slate-500">{timeAgo(n.createdAt)}</p></div>
              </Link>))}
            {d && !d.notifications.length && <p className="p-4 text-slate-500">You're all caught up.</p>}
          </Card>
        </section>
      </div>
    </div>
  )
}
