import { Link } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import Button from '../ui/Button'
import { StatusBadge } from '../ui/Badge'
import { Stars } from '../profile/ReviewList'
import { formatDate } from '../../utils/formatters'

// Work status and unread messages only exist on the real API; the mock simply does not send them
const workOf = (h) => h.workStatus ?? 'IN_PROGRESS'
const OPEN_LABEL = { IN_PROGRESS: 'Submit work', SUBMITTED: 'View submission', REVISION_REQUESTED: 'Respond to revision' }

function Actions({ h, isCompany, viewerId, onComplete, onCancel, onReview }) {
  const mine = h.reviews.find((r) => r.reviewerId === viewerId)
  const theirs = h.reviews.find((r) => r.reviewerId !== viewerId)
  const other = isCompany ? 'freelancer' : 'company'
  const to = `/${isCompany ? 'company' : 'freelancer'}/hirings/${h.id}`
  const work = workOf(h)
  if (h.status === 'ACTIVE') return isCompany
    ? <div className="flex flex-wrap gap-2">
      <Button as={Link} to={to} size="sm" variant={work === 'SUBMITTED' ? 'primary' : 'secondary'}>{work === 'SUBMITTED' ? 'Review work' : 'View deliverables'}</Button>
      <Button size="sm" variant="secondary" onClick={() => onComplete(h)}>Mark as Completed</Button>
      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => onCancel(h)}>Cancel hiring</Button>
    </div>
    : <div className="space-y-2"><Button as={Link} to={to} size="sm" variant={work === 'SUBMITTED' ? 'secondary' : 'primary'}>{OPEN_LABEL[work] ?? 'Open'}</Button><p className="text-slate-500">Reviews open when the project is completed.</p></div>
  if (h.status === 'CANCELLED') return <div className="space-y-1.5"><p className="text-slate-500">{h.cancelReason ? `Reason: ${h.cancelReason}` : 'Hiring cancelled.'}</p><Link to={to} className="font-medium text-brand-700 hover:underline">View details</Link></div>
  return (
    <div className="space-y-1.5">
      {mine ? <p className="flex items-center gap-2 text-slate-600">Your review <Stars value={mine.rating} /></p> : <Button size="sm" variant="secondary" onClick={() => onReview(h)}>Review {other}</Button>}
      {theirs && <p className="flex items-center gap-2 text-slate-600">Their review <Stars value={theirs.rating} /></p>}
      <Link to={to} className="font-medium text-brand-700 hover:underline">View details</Link>
    </div>
  )
}

const Unread = ({ n }) => (n > 0 ? <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white"><MessageSquare className="size-3" aria-hidden />{n} new {n === 1 ? 'message' : 'messages'}</span> : null)
const Statuses = ({ h }) => (
  <div className="flex flex-col items-start gap-1">
    <StatusBadge status={h.status} />
    {h.status === 'ACTIVE' && workOf(h) !== 'IN_PROGRESS' && <StatusBadge status={workOf(h)} />}
    <Unread n={h.unreadMessages} />
  </div>)

// Table from md up; stacked cards on mobile
export default function HiringsTable({ hirings, isCompany, viewerId, ...handlers }) {
  const who = (h) => (isCompany ? { name: h.freelancer.name, to: `/freelancers/${h.freelancer.id}` } : { name: h.company.name, to: `/companies/${h.company.id}` })
  const detail = (h) => `/${isCompany ? 'company' : 'freelancer'}/hirings/${h.id}`
  const actions = (h) => <Actions h={h} isCompany={isCompany} viewerId={viewerId} {...handlers} />
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{[isCompany ? 'Freelancer' : 'Company', 'Project', 'Start date', 'Status', 'Completion date', 'Actions'].map((c) => <th key={c} scope="col" className="px-5 py-3 font-medium">{c}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {hirings.map((h) => (
              <tr key={h.id} className="align-top">
                <td className="px-5 py-4 font-medium"><Link to={who(h).to} className="text-slate-900 hover:text-brand-600">{who(h).name}</Link></td>
                <td className="px-5 py-4 text-slate-700"><Link to={detail(h)} className="hover:text-brand-600">{h.project.title}</Link></td>
                <td className="px-5 py-4 text-slate-600">{formatDate(h.startDate)}</td>
                <td className="px-5 py-4"><Statuses h={h} /></td>
                <td className="px-5 py-4 text-slate-600">{h.completedAt ? formatDate(h.completedAt) : '—'}</td>
                <td className="px-5 py-4">{actions(h)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {hirings.map((h) => (
          <li key={h.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><Link to={detail(h)} className="font-medium text-slate-900 hover:text-brand-600">{h.project.title}</Link><p><Link to={who(h).to} className="text-slate-500 hover:text-brand-600">{who(h).name}</Link></p></div><Statuses h={h} /></div>
            <p className="mt-3 text-slate-600">Started {formatDate(h.startDate)}{h.completedAt && ` · Completed ${formatDate(h.completedAt)}`}</p>
            <div className="mt-3 border-t border-slate-100 pt-3">{actions(h)}</div>
          </li>))}
      </ul>
    </>
  )
}
