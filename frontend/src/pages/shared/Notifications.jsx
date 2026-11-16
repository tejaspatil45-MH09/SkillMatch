import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Bell, CheckCheck, CheckCircle2, Eye, Flag, Handshake, Inbox, ListChecks, MessageSquare, RotateCcw, Send, ShieldCheck, Star, XCircle } from 'lucide-react'
import clsx from 'clsx'
import PageHeader from '../../components/ui/PageHeader'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/LoadingSpinner'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { useNotifications } from '../../context/NotificationContext'
import { notificationService } from '../../services/notificationService'
import { timeAgo } from '../../utils/formatters'

const ICONS = { SHORTLISTED: ListChecks, REJECTED: XCircle, DEMO: ShieldCheck, DEMO_VIEWED: Eye, HIRED: Handshake, COMPLETED: CheckCircle2, CANCELLED: Ban, PROPOSAL: Inbox, REVIEW: Star, REPORT: Flag, WORK_SUBMITTED: Send, REVISION_REQUESTED: RotateCcw, WORK_APPROVED: CheckCircle2, MESSAGE: MessageSquare }
const TABS = [['ALL', 'All'], ['UNREAD', 'Unread'], ['READ', 'Read']]

export default function Notifications() {
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh } = useNotifications()
  const { data, error, reload } = useAsync(() => notificationService.getNotifications(), [])
  const [tab, setTab] = useState('ALL')
  const [busy, setBusy] = useState(false)
  if (error) return <ErrorState message={error.message} onRetry={reload} />

  const unreadCount = data?.filter((n) => !n.read).length ?? 0
  const shown = data && data.filter((n) => tab === 'ALL' || (tab === 'UNREAD' ? !n.read : n.read))
  const count = (t) => (t === 'ALL' ? data.length : data.filter((n) => (t === 'UNREAD' ? !n.read : n.read)).length)

  async function open(n) {
    try { if (!n.read) { await notificationService.markRead(n.id); refresh() } } finally { navigate(n.link) }
  }
  async function markAll() {
    setBusy(true)
    try { await notificationService.markAllRead(); toast('All notifications marked as read.'); await refresh(); reload() }
    catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title="Notifications" description="Updates about your proposals, demos, hirings and projects."
        action={<Button variant="secondary" onClick={markAll} loading={busy} disabled={!unreadCount}><CheckCheck className="size-4" aria-hidden />Mark all as read</Button>} />
      {!data ? <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        : !data.length ? <EmptyState icon={Bell} title="No notifications yet" description="You'll see updates here when something happens on your projects and proposals." />
        : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
            {TABS.map(([t, l]) => <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
              className={clsx('rounded-full px-3.5 py-1.5 text-xs font-medium ring-1 ring-inset', tab === t ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50')}>{l} ({count(t)})</button>)}
          </div>
          {shown.length ? <Card className="divide-y divide-slate-100">{shown.map((n) => {
            const Icon = ICONS[n.type] ?? Bell
            return (
              <button key={n.id} onClick={() => open(n)} className={clsx('flex w-full items-start gap-4 p-4 text-left hover:bg-slate-50', !n.read && 'bg-brand-50/40')}>
                <span className={clsx('mt-0.5 rounded-lg p-2', n.read ? 'bg-slate-100 text-slate-500' : 'bg-brand-50 text-brand-600')}><Icon className="size-4" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className={clsx('block', n.read ? 'text-slate-600' : 'font-medium text-slate-900')}>{n.message}</span><span className="mt-0.5 block text-xs text-slate-500">{timeAgo(n.createdAt)}</span></span>
                <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', n.read ? 'text-slate-500' : 'bg-brand-600 text-white')}>{n.read ? 'Read' : 'Unread'}</span>
              </button>)
          })}</Card>
            : <EmptyState title={tab === 'UNREAD' ? "You're all caught up" : 'No read notifications'} description={tab === 'UNREAD' ? 'No unread notifications right now.' : 'Notifications you have opened will appear here.'} />}
        </>}
    </div>
  )
}
