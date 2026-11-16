import { Link } from 'react-router-dom'
import { StatusBadge } from '../ui/Badge'
import { formatDate, formatINR } from '../../utils/formatters'

// Table from md up; stacked cards on mobile
export default function ProposalsTable({ proposals }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>{['Project', 'Company', 'Bid', 'Submitted', 'Status'].map((h) => <th key={h} scope="col" className="px-5 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposals.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-5 py-4 font-medium"><Link to={`/freelancer/proposals/${p.id}`} className="text-slate-900 hover:text-brand-600">{p.project.title}</Link></td>
                <td className="px-5 py-4 text-slate-600">{p.project.companyName}</td>
                <td className="px-5 py-4 text-slate-900">{formatINR(p.bidAmount)}</td>
                <td className="px-5 py-4 text-slate-600">{formatDate(p.createdAt)}</td>
                <td className="px-5 py-4"><StatusBadge status={p.status} /></td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {proposals.map((p) => (
          <li key={p.id}><Link to={`/freelancer/proposals/${p.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="font-medium text-slate-900">{p.project.title}</p><p className="text-slate-500">{p.project.companyName}</p></div><StatusBadge status={p.status} /></div>
            <p className="mt-3 text-slate-600">{formatINR(p.bidAmount)} · Submitted {formatDate(p.createdAt)}</p></Link></li>))}
      </ul>
    </>
  )
}
