import { Star } from 'lucide-react'
import { formatDate } from '../../utils/formatters'
export const Stars = ({ value }) => <span className="inline-flex" role="img" aria-label={`${value} out of 5 stars`}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden className={`size-4 ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />)}</span>
export default function ReviewList({ reviews }) {
  if (!reviews.length) return <p className="text-slate-500">No reviews yet. Reviews appear here after a project is completed.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {reviews.map((r) => (
        <li key={r.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{r.reviewerName}</p><Stars value={r.rating} /></div>
          {r.comment && <p className="mt-1.5 text-slate-600">{r.comment}</p>}<p className="mt-1 text-xs text-slate-500">{formatDate(r.createdAt)}</p>
        </li>))}
    </ul>
  )
}
