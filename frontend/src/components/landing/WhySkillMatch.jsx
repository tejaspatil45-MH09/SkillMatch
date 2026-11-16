import { Check } from 'lucide-react'
import Section from './Section'
import Card from '../ui/Card'

const POINTS = ['Matching you can explain: no black-box scores', 'Clear status at every stage of a proposal', 'Companies see work before they commit to a hire', 'Both sides can review after the project ends']

export default function WhySkillMatch() {
  return (
    <Section id="why" tone="muted">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-600">Why SkillMatch</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Transparent matching, fewer wasted proposals</h2>
          <p className="mt-3 text-base text-slate-600">Freelancers can see which projects fit before they apply. Companies see proposals ranked by fit, with the details needed to decide.</p>
          <ul className="mt-6 space-y-3">{POINTS.map((p) => <li key={p} className="flex gap-3 text-slate-700"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden />{p}</li>)}</ul>
        </div>
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900">How the match is calculated</h3>
          <p className="mt-1 text-slate-500">Matched required skills ÷ total required skills</p>
          <div className="mt-5 space-y-2.5">
            {[['React', true], ['Node.js', true], ['PostgreSQL', false]].map(([s, has]) => (
              <div key={s} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5"><span className="font-medium text-slate-800">{s}</span>
                <span className={has ? 'text-green-700' : 'text-slate-500'}>{has ? 'On your profile' : 'Not on your profile'}</span></div>
            ))}
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-slate-700">2 of 3 required skills = <span className="font-semibold text-slate-900">67% match</span></p>
        </Card>
      </div>
    </Section>
  )
}
