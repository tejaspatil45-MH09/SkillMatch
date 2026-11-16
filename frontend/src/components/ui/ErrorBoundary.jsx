import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

// Last line of defence: a render error shows a friendly message instead of a blank screen
export default class ErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error(error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <AlertTriangle className="size-10 text-red-600" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 max-w-sm text-slate-600">An unexpected error occurred. Reloading the page usually fixes it.</p>
        <button onClick={() => window.location.assign('/')} className="mt-6 h-10 rounded-lg bg-brand-600 px-4 font-medium text-white hover:bg-brand-700">Back to home</button>
      </div>
    )
  }
}
