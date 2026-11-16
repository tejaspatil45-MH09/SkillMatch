import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Flag } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import EmptyState from '../../components/ui/EmptyState'
import Button from '../../components/ui/Button'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import Table from '../../components/ui/Table'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { adminService } from '../../services/adminService'
import { formatDate, labelize } from '../../utils/formatters'

const TABS = [['OPEN', 'Open'], ['RESOLVED', 'Resolved'], ['ALL', 'All']]
export default function Reports() {
  const toast = useToast()
  const { data, error, reload } = useAsync(() => adminService.getReports(), [])
  const [tab, setTab] = useState('OPEN'); const [busyId, setBusyId] = useState(null)
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  async function resolve(r) {
    setBusyId(r.id)
    try { await adminService.resolveReport(r.id); toast('Report marked as resolved.'); reload() } catch (e) { toast(e.message, 'error') } finally { setBusyId(null) }
  }
  const shown = data && (tab === 'ALL' ? data : data.filter((r) => r.status === tab))
  const count = (t) => (t === 'ALL' ? data.length : data.filter((r) => r.status === t).length)
  const columns = [
    { key: 'target', header: 'Reported', primary: true, render: (r) => <div className="text-left"><p className="text-xs text-slate-500">{labelize(r.targetType)}</p>{r.targetLink ? <Link to={r.targetLink} className="font-medium text-slate-900 hover:text-brand-600">{r.targetName}</Link> : <span className="font-medium text-slate-500">{r.targetName}</span>}</div> },
    { key: 'reason', header: 'Reason', className: 'max-w-sm', render: (r) => <span className="text-left text-slate-700">{r.reason}</span> },
    { key: 'reporterName', header: 'Reported by' },
    { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
    { key: 'status', header: 'Status', render: (r) => (r.status === 'OPEN' ? <Badge className="bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20">Open</Badge> : <StatusBadge status="RESOLVED" />) },
    { key: 'actions', header: 'Actions', render: (r) => r.status === 'OPEN' ? <Button size="sm" variant="secondary" loading={busyId === r.id} onClick={() => resolve(r)}>Resolve</Button> : <span className="text-xs text-slate-500">—</span> },
  ]
  return (
    <div>
      <PageHeader title="Reports" description="Reports submitted by users about profiles and projects." />
      {!data ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : !data.length ? <EmptyState icon={Flag} title="No reports" description="When users report a profile or project, the reports will appear here." />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter reports">
            {TABS.map(([t, l]) => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t} className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', tab === t ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{l} ({count(t)})</button>)}
          </div>
          {shown.length ? <Table columns={columns} rows={shown} caption="Reports" /> : <EmptyState title="Nothing to review" description={tab === 'OPEN' ? 'All reports have been resolved.' : 'No reports here yet.'} />}
        </>}
    </div>
  )
}
