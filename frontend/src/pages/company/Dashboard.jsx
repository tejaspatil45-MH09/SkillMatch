import { Link } from 'react-router-dom'
import { CheckCircle2, FolderKanban, FolderOpen, Handshake, Inbox, ListChecks, Plus } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'
import { timeAgo } from '../../utils/formatters'

export default function Dashboard() {
  const { data: d, loading, error, reload } = useAsync(() => profileService.getCompanyDashboard(), [])
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const stats = [['Active projects', 'activeProjects', FolderKanban], ['Open projects', 'openProjects', FolderOpen], ['Received proposals', 'receivedProposals', Inbox], ['Shortlisted freelancers', 'shortlisted', ListChecks], ['Active hirings', 'activeHirings', Handshake], ['Completed projects', 'completedProjects', CheckCircle2]]
  return (
    <div>
      <PageHeader title="Dashboard" description="An overview of your projects, proposals and hirings." action={<Button as={Link} to="/company/projects/create"><Plus className="size-4" aria-hidden />Post a project</Button>} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, key, icon]) => <StatCard key={key} label={label} icon={icon} loading={loading} value={d?.[key]} />)}
      </div>
      <section className="mt-8" aria-labelledby="activity">
        <div className="mb-3 flex items-center justify-between"><h2 id="activity" className="font-semibold text-slate-900">Recent activity</h2><Link to="/notifications" className="font-medium text-brand-600 hover:text-brand-700">View all</Link></div>
        <Card className="divide-y divide-slate-100">
          {loading && <div className="space-y-3 p-4"><Skeleton /><Skeleton /><Skeleton /></div>}
          {d?.recentActivity.map((n) => (
            <Link key={n.id} to={n.link} className="flex gap-3 p-4 hover:bg-slate-50">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} aria-label={n.read ? undefined : 'Unread'} />
              <div><p className="text-slate-700">{n.message}</p><p className="mt-0.5 text-xs text-slate-500">{timeAgo(n.createdAt)}</p></div>
            </Link>))}
          {d && !d.recentActivity.length && <p className="p-4 text-slate-500">No activity yet. Post a project to get started.</p>}
        </Card>
      </section>
    </div>
  )
}
