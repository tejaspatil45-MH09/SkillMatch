import { AlertTriangle } from 'lucide-react'
import Button from './Button'
export default function ErrorState({ message = 'Something went wrong while loading this page.', onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 size-7 text-red-600" aria-hidden />
      <p className="text-red-800">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
