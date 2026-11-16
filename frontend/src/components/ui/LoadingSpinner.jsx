import { Loader2 } from 'lucide-react'
export default function LoadingSpinner({ label = 'Loading' }) {
  return <div role="status" className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="size-5 animate-spin" aria-hidden />{label}…</div>
}
export const Skeleton = ({ className = 'h-4 w-full' }) => <div aria-hidden className={`animate-pulse rounded bg-slate-200 ${className}`} />
