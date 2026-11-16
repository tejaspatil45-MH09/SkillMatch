import { Link } from 'react-router-dom'
import { ShieldCheck, Target } from 'lucide-react'
import Button from '../ui/Button'
import Card from '../ui/Card'
import { StatusBadge } from '../ui/Badge'
import SearchBar from './SearchBar'

// Illustrative preview card (sample data, labelled as such)
function PreviewCard() {
  return (
    <Card className="p-5" aria-label="Sample project card">
      <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Sample project</p>
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold text-slate-900">E-commerce Website</p><p className="text-slate-500">TechNova Solutions · Pune</p></div>
        <div className="rounded-lg bg-green-50 px-2.5 py-1.5 text-center"><p className="text-lg font-bold leading-none text-green-700">92%</p><p className="text-[10px] text-green-700">skill match</p></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">{['React', 'Node.js', 'PostgreSQL'].map((s) => <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{s}</span>)}</div>
      <p className="mt-4 text-slate-600">₹25,000 - ₹40,000 · 30 days</p>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="size-4 text-brand-600" aria-hidden />Demo available</span><StatusBadge status="SHORTLISTED" />
      </div>
    </Card>
  )
}

export default function Hero() {
  return (
    <section className="bg-gradient-to-b from-brand-50/60 to-white">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:py-20 lg:grid-cols-2">
        <div>
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-600/10"><Target className="size-3.5" aria-hidden />Skill-based matching for freelancers and companies</p>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">Find the right talent.<br />Build the right project.</h1>
          <p className="mt-5 max-w-lg text-base text-slate-600">SkillMatch connects companies with freelancers based on skills and project requirements, so every proposal starts from a real fit.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button as={Link} to="/projects" size="lg">Find Projects</Button>
            <Button as={Link} to="/register" variant="secondary" size="lg">Post a Project</Button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-md"><PreviewCard /></div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-16"><SearchBar /></div>
    </section>
  )
}
