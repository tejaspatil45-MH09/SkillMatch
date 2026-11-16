import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you're looking for doesn't exist or has moved.</p>
      <Button as={Link} to="/dashboard" className="mt-6">Go to dashboard</Button>
    </div>
  )
}
