import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Building2, ClipboardList, Clock, FolderKanban, Handshake, Info, Percent, Star, Target, UserRound } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Table from '../ui/Table'
import { Skeleton } from '../ui/LoadingSpinner'
import { ChartCard, FigureList, PALETTE, RankBars, STATUS_COLORS, StackedBars, StatusDonut, TrendLine } from './charts'
import { formatCount, formatDuration, formatPercent, formatRating, hasAny, monthLabel } from '../../utils/analytics'
import { formatDate, labelize } from '../../utils/formatters'

function Metric({ label, value, hint, icon: Icon, loading }) {
  return (
    <section aria-label={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><h3 className="font-normal text-slate-500">{label}</h3>{Icon && <Icon className="size-5 text-slate-400" aria-hidden />}</div>
      {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>}
      {!loading && hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </section>
  )
}

const Facts = ({ title, rows }) => (
  <Card className="p-6">
    <h3 className="font-semibold text-slate-900">{title}</h3>
    <dl className="mt-3 divide-y divide-slate-100">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-4 py-2"><dt className="text-slate-600">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>)}</dl>
  </Card>
)

const Ranking = ({ title, hint, rows, unit, linkBase }) => {
  const list = rows.map((r, i) => ({ ...r, rank: i + 1 }))
  const columns = [
    { key: 'rank', header: '#', className: 'w-12 text-slate-500', render: (r) => r.rank },
    { key: 'name', header: 'Name', primary: true, render: (r) => <span className="inline-flex flex-wrap items-center gap-2">{linkBase ? <Link to={`${linkBase}/${r.id}`} className="font-medium text-slate-900 hover:text-brand-600">{r.name}</Link> : <span className="font-medium text-slate-900">{r.name}</span>}{r.suspended && <Badge className="bg-red-50 text-red-700">Suspended</Badge>}</span> },
    { key: 'count', header: unit, className: 'text-right font-medium', render: (r) => formatCount(r.count) },
  ]
  return (
    <div><h3 className="mb-1 font-semibold text-slate-900">{title}</h3>{hint && <p className="mb-3 text-xs text-slate-500">{hint}</p>}
      {list.length ? <Table columns={columns} rows={list} caption={title} /> : <p className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-slate-500">Nothing to rank in this period.</p>}</div>
  )
}

// Everything on the page, computed by the server from the database; this component only lays it out.
// It never calculates a business number itself, so what is on screen is always what the CSV contains.
export default function AnalyticsReport({ data, loading }) {
  const d = data
  const monthly = d?.projects.monthly.map((m) => ({ label: monthLabel(m.month), value: m.count })) ?? []
  const hiringMonthly = d?.hirings.monthly.map((m) => ({ label: monthLabel(m.month), Completed: m.completed, Ongoing: m.ongoing, Cancelled: m.cancelled })) ?? []
  const statusData = d?.projects.byStatus.map((s) => ({ name: labelize(s.status), value: s.count, color: STATUS_COLORS[s.status] })) ?? []
  const skills = d?.skills.demand.map((s) => ({ name: s.name, value: s.projects })) ?? []
  const top = (list) => list.slice(0, 5).map((x) => ({ name: x.name, value: x.count }))
  const f = d?.filters

  return (
    <div className={clsx('space-y-8 transition-opacity', loading && d && 'opacity-60')} aria-busy={loading}>
      {d && <p className="text-slate-600" data-testid="applied-filters">Showing <strong className="font-medium text-slate-900">{f.label}</strong> · projects: <strong className="font-medium text-slate-900">{f.projectStatus ? labelize(f.projectStatus) : 'all statuses'}</strong> · hirings: <strong className="font-medium text-slate-900">{f.hiringStatus ? (f.hiringStatus === 'ACTIVE' ? 'Ongoing' : labelize(f.hiringStatus)) : 'all statuses'}</strong></p>}

      <section aria-labelledby="summary-title">
        <h2 id="summary-title" className="mb-3 text-lg font-semibold text-slate-900">Key metrics</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric loading={!d} icon={FolderKanban} label="Projects posted" value={formatCount(d?.projects.total)} hint={d && `${formatCount(d.projects.active)} active · ${formatCount(d.projects.completed)} completed · ${formatCount(d.projects.cancelled)} cancelled`} />
          <Metric loading={!d} icon={Handshake} label="Hirings" value={formatCount(d?.hirings.total)} hint={d && `${formatCount(d.hirings.ongoing)} ongoing · ${formatCount(d.hirings.successful)} completed · ${formatCount(d.hirings.cancelled)} cancelled`} />
          <Metric loading={!d} icon={ClipboardList} label="Proposals submitted" value={formatCount(d?.proposals.total)} hint={d && `${formatCount(d.proposals.accepted)} accepted · ${formatCount(d.proposals.rejected)} rejected · ${formatCount(d.proposals.pending)} pending`} />
          <Metric loading={!d} icon={Percent} label="Hiring success rate" value={formatPercent(d?.hirings.successRate)} hint={d && (d.hirings.concluded ? `${formatCount(d.hirings.successful)} of ${formatCount(d.hirings.concluded)} finished hirings were completed` : 'No finished hirings in this period')} />
          <Metric loading={!d} icon={Target} label="Proposal acceptance rate" value={formatPercent(d?.proposals.acceptanceRate)} hint={d && (d.proposals.total ? `${formatCount(d.proposals.accepted)} of ${formatCount(d.proposals.total)} submitted proposals` : 'No proposals in this period')} />
          <Metric loading={!d} icon={Clock} label="Average time to hire" value={formatDuration(d?.hirings.timeToHire.seconds)} hint={d && (d.hirings.timeToHire.sampleSize ? `Project posted to hire, across ${formatCount(d.hirings.timeToHire.sampleSize)} hirings${d.hirings.timeToHire.excluded ? ` (${d.hirings.timeToHire.excluded} left out: dated before their project)` : ''}` : 'No hirings in this period')} />
          <Metric loading={!d} icon={UserRound} label="Registered freelancers" value={formatCount(d?.freelancers.total)} hint={d && `${formatCount(d.freelancers.active)} active · ${formatCount(d.freelancers.suspended)} suspended · ${formatCount(d.freelancers.registeredInRange)} joined in period`} />
          <Metric loading={!d} icon={Building2} label="Registered companies" value={formatCount(d?.companies.total)} hint={d && `${formatCount(d.companies.active)} active · ${formatCount(d.companies.suspended)} suspended · ${formatCount(d.companies.registeredInRange)} joined in period`} />
          <Metric loading={!d} icon={Star} label="Average freelancer rating" value={formatRating(d?.freelancers.averageRating.value)} hint={d && (d.freelancers.averageRating.reviews ? `${formatCount(d.freelancers.averageRating.reviews)} reviews of ${formatCount(d.freelancers.averageRating.freelancers)} freelancers` : 'No reviews in this period')} />
        </div>
      </section>

      {d && (
        <>
          <section aria-labelledby="charts-title">
            <h2 id="charts-title" className="mb-3 text-lg font-semibold text-slate-900">Trends</h2>
            {d.monthsTruncated && <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-amber-800"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />Monthly charts show only the most recent 60 months. Narrow the date range to see older months.</p>}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Projects posted per month" subtitle="Calendar months (UTC)" empty={!hasAny(d.projects.monthly)}
                summary={`Projects posted per month: ${monthly.map((m) => `${m.label} ${m.value}`).join(', ')}`}>
                <TrendLine data={monthly} name="Projects" />
              </ChartCard>
              <ChartCard title="Project status distribution" subtitle="Current status of the projects in this period" empty={!hasAny(d.projects.byStatus)}
                summary={`Project status distribution: ${statusData.map((s) => `${s.name} ${s.value}`).join(', ')}`}
                footer={<FigureList items={statusData.map((s) => [s.name, `${s.value} (${d.projects.total ? Math.round((s.value / d.projects.total) * 100) : 0}%)`])} />}>
                <StatusDonut data={statusData} />
              </ChartCard>
              <ChartCard title="Hirings started per month" subtitle="By the month the hiring began, split by its current status" empty={!hasAny(d.hirings.monthly, (m) => m.total)}
                summary={`Hirings started per month: ${hiringMonthly.map((m) => `${m.label} ${m.Completed} completed, ${m.Ongoing} ongoing, ${m.Cancelled} cancelled`).join('; ')}`}>
                <StackedBars data={hiringMonthly} />
              </ChartCard>
              <ChartCard title="Most popular skills" subtitle="Projects asking for each skill" empty={!skills.length}
                summary={`Most popular skills: ${skills.map((s) => `${s.name} ${s.value}`).join(', ')}`} footer={<FigureList items={skills.map((s) => [s.name, s.value])} />}>
                <RankBars data={skills} unit="Projects" color={PALETTE.brand} />
              </ChartCard>
            </div>
          </section>

          <section aria-labelledby="rank-title">
            <h2 id="rank-title" className="mb-3 text-lg font-semibold text-slate-900">Top 5</h2>
            <div className="grid gap-6 lg:grid-cols-3">
              <ChartCard title="Companies by projects posted" empty={!d.companies.topByProjects.length} summary={`Top companies by projects posted: ${top(d.companies.topByProjects).map((x) => `${x.name} ${x.value}`).join(', ')}`}>
                <RankBars data={top(d.companies.topByProjects)} unit="Projects" color={PALETTE.sky} />
              </ChartCard>
              <ChartCard title="Companies by successful hirings" empty={!d.companies.topByHirings.length} summary={`Top companies by successful hirings: ${top(d.companies.topByHirings).map((x) => `${x.name} ${x.value}`).join(', ')}`}>
                <RankBars data={top(d.companies.topByHirings)} unit="Completed hirings" color={PALETTE.green} />
              </ChartCard>
              <ChartCard title="Freelancers by completed projects" empty={!d.freelancers.topByCompleted.length} summary={`Top freelancers by completed projects: ${top(d.freelancers.topByCompleted).map((x) => `${x.name} ${x.value}`).join(', ')}`}>
                <RankBars data={top(d.freelancers.topByCompleted)} unit="Completed projects" color={PALETTE.amber} />
              </ChartCard>
            </div>
          </section>

          <section aria-labelledby="detail-title">
            <h2 id="detail-title" className="mb-3 text-lg font-semibold text-slate-900">Detailed statistics</h2>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Facts title="Projects" rows={[['Total posted', formatCount(d.projects.total)], ['Active (open + in progress)', formatCount(d.projects.active)], ['Open', formatCount(d.projects.open)], ['In progress', formatCount(d.projects.inProgress)], ['Completed', formatCount(d.projects.completed)], ['Cancelled', formatCount(d.projects.cancelled)]]} />
              <Facts title="Hirings" rows={[['Total hirings', formatCount(d.hirings.total)], ['Successful (completed)', formatCount(d.hirings.successful)], ['Ongoing', formatCount(d.hirings.ongoing)], ['Cancelled', formatCount(d.hirings.cancelled)], ['Success rate', formatPercent(d.hirings.successRate)], ['Average time to hire', formatDuration(d.hirings.timeToHire.seconds)]]} />
              <Facts title="Proposals" rows={[['Total submitted', formatCount(d.proposals.total)], ['Accepted', formatCount(d.proposals.accepted)], ['Rejected', formatCount(d.proposals.rejected)], ['Pending', formatCount(d.proposals.pending)], ['Shortlisted', formatCount(d.proposals.shortlisted)], ['Withdrawn', formatCount(d.proposals.withdrawn)], ['Acceptance rate', formatPercent(d.proposals.acceptanceRate)]]} />
              <Facts title="Freelancers" rows={[['Registered (all time)', formatCount(d.freelancers.total)], ['Active now', formatCount(d.freelancers.active)], ['Suspended now', formatCount(d.freelancers.suspended)], ['Registered in period', formatCount(d.freelancers.registeredInRange)], ['Average rating', formatRating(d.freelancers.averageRating.value)]]} />
              <Facts title="Companies" rows={[['Registered (all time)', formatCount(d.companies.total)], ['Active now', formatCount(d.companies.active)], ['Suspended now', formatCount(d.companies.suspended)], ['Registered in period', formatCount(d.companies.registeredInRange)]]} />
            </div>
          </section>

          <section aria-labelledby="top10-title">
            <h2 id="top10-title" className="mb-3 text-lg font-semibold text-slate-900">Top 10 rankings</h2>
            <div className="grid gap-8 xl:grid-cols-2">
              <Ranking title="Freelancers by completed projects" hint="Completed hirings that started in this period" rows={d.freelancers.topByCompleted} unit="Completed" linkBase="/freelancers" />
              <Ranking title="Most demanded skills" hint="Projects posted in this period that ask for the skill" rows={d.skills.demand.map((s) => ({ id: s.id, name: s.name, count: s.projects }))} unit="Projects" />
              <Ranking title="Companies by projects posted" rows={d.companies.topByProjects} unit="Projects" linkBase="/companies" />
              <Ranking title="Companies by successful hirings" hint="Completed hirings that started in this period" rows={d.companies.topByHirings} unit="Completed" linkBase="/companies" />
            </div>
          </section>

          <section aria-labelledby="notes-title" className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h2 id="notes-title" className="font-semibold text-slate-900">How these numbers are calculated</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-600">
                <li>The date range picks records by when they were <strong className="font-medium">created</strong>: project posted, proposal submitted, hiring started, review written, account registered. Each is counted with its status <strong className="font-medium">today</strong>.</li>
                <li>Project status filters projects and the proposals and hirings on them. Hiring status filters hirings, their rankings and their reviews.</li>
                <li><strong className="font-medium">Hiring success rate</strong> = completed ÷ (completed + cancelled). Ongoing hirings are not counted as failures.</li>
                <li><strong className="font-medium">Proposal acceptance rate</strong> = accepted ÷ all submitted. Rejected includes proposals closed automatically when another was accepted.</li>
                <li><strong className="font-medium">Average time to hire</strong> = project posted to hiring started. <strong className="font-medium">Average rating</strong> = mean of all ratings freelancers received.</li>
                <li>Account totals (active, suspended) are a snapshot of now. A dash means the figure cannot be calculated, never zero.</li>
              </ul>
            </Card>
            <Card className="p-6">
              <h2 className="font-semibold text-slate-900">Not available</h2>
              <p className="mt-1 text-xs text-slate-500">These cannot be calculated reliably from the data the platform stores, so they are not shown.</p>
              <ul className="mt-3 space-y-3">{d.unavailable.map((u) => <li key={u.metric}><p className="font-medium text-slate-900">{u.metric}</p><p className="text-slate-600">{u.reason}</p></li>)}</ul>
            </Card>
          </section>
          <p className="text-xs text-slate-500">Generated {formatDate(d.generatedAt)} from the live database.</p>
        </>
      )}
    </div>
  )
}
