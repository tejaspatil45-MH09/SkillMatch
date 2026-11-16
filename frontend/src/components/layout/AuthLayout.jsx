import { Outlet } from 'react-router-dom'
import Logo from './Logo'
import SkipLink from './SkipLink'
export default function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <SkipLink />
      <header><Logo /></header>
      <main id="main" tabIndex={-1} className="mt-8 w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm outline-none sm:p-8"><Outlet /></main>
    </div>
  )
}
