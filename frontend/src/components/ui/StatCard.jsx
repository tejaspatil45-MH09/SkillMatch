import Card from './Card'
import { Skeleton } from './LoadingSpinner'
export default function StatCard({ label, value, icon: Icon, children, loading }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between"><p className="text-slate-500">{label}</p>{Icon && <Icon className="size-5 text-slate-400" aria-hidden />}</div>
      {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>}
      {children}
    </Card>
  )
}
