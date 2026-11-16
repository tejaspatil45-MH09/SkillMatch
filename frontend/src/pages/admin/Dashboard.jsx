import { Link } from 'react-router-dom'
import { Building2, Flag, FolderKanban, FolderOpen, UserRound, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Card from '../../components/ui/Card'
import ErrorState from '../../components/ui/ErrorState'
import { useAsync } from '../../hooks/useAsync'
import { adminService } from '../../services/adminService'
import { labelize } from '../../utils/formatters'

export default function Dashboard() {
  const { data: d, loading, error, reload } = useAsync(() => adminService.getStats(), [])
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  const stats = [['Total users', 'totalUsers', Users], ['Freelancers', 'freelancers', UserRound], ['Companies', 'companies', Building2], ['Projects', 'projects', FolderKanban], ['Active projects', 'activeProjects', FolderOpen], ['Open reports', 'reports', Flag]]
  const chart = d?.projectsByStatus.map((x) => ({ name: labelize(x.status), count: x.count }))
  return (
    <div>
      <PageHeader title="Admin dashboard" description="A snapshot of activity across the platform." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{stats.map(([l, k, i]) => <StatCard key={k} label={l} icon={i} loading={loading} value={d?.[k]} />)}</div>
      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Projects by status</h2>
          {chart && <>
            <div className="mt-4 h-64" role="img" aria-label={`Projects by status: ${chart.map((c) => `${c.name} ${c.count}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={chart} margin={{ left: -20 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tickLine={false} fontSize={12} /><YAxis allowDecimals={false} tickLine={false} fontSize={12} /><Tooltip cursor={{ fill: '#f1f5f9' }} /><Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">{chart.map((c) => <li key={c.name}>{c.name}: <span className="font-medium text-slate-700">{c.count}</span></li>)}</ul></>}
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold text-slate-900">Needs attention</h2>
          <p className="mt-3 text-3xl font-semibold text-slate-900">{d?.reports ?? '–'}</p>
          <p className="text-slate-500">open {d?.reports === 1 ? 'report' : 'reports'} awaiting review</p>
          <Link to="/admin/reports" className="mt-5 inline-block font-medium text-brand-600 hover:text-brand-700">Review reports</Link>
        </Card>
      </div>
    </div>
  )
}
