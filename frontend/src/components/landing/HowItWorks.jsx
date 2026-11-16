import { FilePlus2, Percent, PlayCircle, Handshake } from 'lucide-react'
import Section from './Section'

const STEPS = [
  { icon: FilePlus2, title: 'Post or browse', text: 'Companies post projects with required skills. Freelancers browse open projects.' },
  { icon: Percent, title: 'See your match', text: 'Each project shows how many of its required skills a freelancer has.' },
  { icon: PlayCircle, title: 'Shortlist and demo', text: 'Companies shortlist proposals. Shortlisted freelancers can share a demo of their work.' },
  { icon: Handshake, title: 'Hire and review', text: 'The company hires, tracks the project to completion, and both sides leave a review.' },
]
export default function HowItWorks() {
  return (
    <Section id="how" tone="muted" eyebrow="How it works" title="From project post to completed work in four steps">
      <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between"><span className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Icon className="size-5" aria-hidden /></span><span aria-hidden className="text-sm font-semibold text-slate-300">0{i + 1}</span></div>
            <h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1.5 text-slate-600">{text}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}
