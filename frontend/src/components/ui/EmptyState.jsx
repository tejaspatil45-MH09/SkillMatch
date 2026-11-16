import { Inbox } from 'lucide-react'
export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <span className="mb-4 rounded-full bg-slate-100 p-3 text-slate-500"><Icon className="size-6" aria-hidden /></span>
      <h2 className="font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
