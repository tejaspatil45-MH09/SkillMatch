import { Link, Outlet } from 'react-router-dom'
import Logo from './Logo'
import Footer from './Footer'
import SkipLink from './SkipLink'
import Button from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { ROLE_HOME } from '../../utils/constants'

const LINKS = [['How it works', '/#how'], ['Features', '/#features'], ['Secure demos', '/#secure-demo']]

export default function PublicLayout() {
  const { user } = useAuth()
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SkipLink />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {LINKS.map(([l, h]) => <a key={l} href={h} className="font-medium text-slate-600 hover:text-slate-900">{l}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            {user ? <Button as={Link} to={ROLE_HOME[user.role]} size="sm">Dashboard</Button> : <>
              <Button as={Link} to="/login" variant="ghost" size="sm">Log in</Button>
              <Button as={Link} to="/register" size="sm">Sign up</Button></>}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none"><Outlet /></main>
      <Footer />
    </div>
  )
}
