import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import Section from './Section'
import Button from '../ui/Button'

function Panel({ id, eyebrow, title, items, cta, to, variant }) {
  return (
    <div id={id} className="scroll-mt-20 rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-slate-900">{title}</h3>
      <ul className="mt-5 space-y-3">{items.map((i) => <li key={i} className="flex gap-3 text-slate-600"><Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />{i}</li>)}</ul>
      <Button as={Link} to={to} variant={variant} className="mt-7">{cta}</Button>
    </div>
  )
}
export default function Audience() {
  return (
    <Section id="audience" title="Built for both sides of the project" subtitle="Whether you are hiring or looking for work, the flow is clear and fair.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel eyebrow="For freelancers" title="Show your skills, win relevant work" cta="Create freelancer profile" to="/register" variant="primary"
          items={['Build a profile with skills and a portfolio', 'See your skill-match percentage before applying', 'Submit one proposal per project with your bid and timeline', 'Share a demo once you are shortlisted', 'Track proposals and active projects in one dashboard']} />
        <Panel eyebrow="For companies" title="Post a project, review focused proposals" cta="Post a project" to="/register" variant="secondary"
          items={['Create a company profile and post projects with required skills', 'Review proposals ranked by skill match', 'Shortlist, reject, or request a demo from shortlisted freelancers', 'Hire, track progress, and mark projects completed', 'Review freelancers after the work is done']} />
      </div>
    </Section>
  )
}
