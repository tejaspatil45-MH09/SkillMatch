import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'
import Navbar from './Navbar'
import Sidebar from './Sidebar'
import SkipLink from './SkipLink'

export default function DashboardLayout() {
  const [drawer, setDrawer] = useState(false)
  return (
    <div className="min-h-screen">
      <SkipLink />
      <Navbar onMenu={() => setDrawer(true)} />
      <div className="flex">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-slate-200 bg-white lg:block"><Sidebar /></aside>
        {drawer && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDrawer(false)} />
            <div className="relative h-full w-64 bg-white shadow-lg">
              <button onClick={() => setDrawer(false)} aria-label="Close navigation" className="absolute right-3 top-3 rounded-lg p-2 hover:bg-slate-100"><X className="size-5" /></button>
              <div className="pt-12"><Sidebar onNavigate={() => setDrawer(false)} /></div>
            </div>
          </div>
        )}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 p-4 outline-none sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
      </div>
    </div>
  )
}
