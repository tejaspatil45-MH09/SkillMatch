import { Clock, Eye, Lock, Info } from 'lucide-react'
import Section from './Section'
import Card from '../ui/Card'
import { StatusBadge } from '../ui/Badge'

const RULES = [
  { icon: Lock, title: 'Project owner only', text: 'Only the company that owns the project can open the demo.' },
  { icon: Eye, title: 'Viewable once', text: 'After the demo is opened, access is closed.' },
  { icon: Clock, title: '24-hour window', text: 'Access also ends 24 hours after the demo is submitted.' },
]
const STATES = [['AVAILABLE', 'Demo expires in 8 hours'], ['VIEWED', 'Access to this demo has been used'], ['EXPIRED', 'The 24-hour window has ended'], ['DENIED', 'This account cannot open this demo']]

export default function SecureDemo() {
  return (
    <Section id="secure-demo" tone="muted" eyebrow="Secure demo access" title="Share work with the right company, once" subtitle="Freelancers can show real work before being hired, without sending a link to anyone who asks.">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-5">
          {RULES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4"><span className="h-fit rounded-lg bg-brand-50 p-2.5 text-brand-600"><Icon className="size-5" aria-hidden /></span>
              <div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-slate-600">{text}</p></div></div>
          ))}
          <p className="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />This is platform-level access control. SkillMatch cannot prevent screenshots or screen recording of a demo that has been opened.</p>
        </div>
        <Card className="divide-y divide-slate-100">
          <p className="px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">Access states you will see</p>
          {STATES.map(([s, text]) => <div key={s} className="flex items-center justify-between gap-3 px-5 py-3.5"><span className="text-slate-700">{text}</span><StatusBadge status={s} /></div>)}
        </Card>
      </div>
    </Section>
  )
}
