import { Percent, FileText, ShieldCheck, ClipboardList, Star, Bell } from 'lucide-react'
import Section from './Section'

const FEATURES = [
  { icon: Percent, title: 'Skill-match percentage', text: 'A clear, explainable score based on required skills versus the skills on a profile.' },
  { icon: FileText, title: 'Structured proposals', text: 'Cover letter, bid and timeline in one format, so companies can compare fairly.' },
  { icon: ShieldCheck, title: 'Secure demo access', text: 'Demos are shared with the project owner only, viewable once within 24 hours.' },
  { icon: ClipboardList, title: 'Hiring tracking', text: 'Follow every hire from start date to completion in one place.' },
  { icon: Star, title: 'Two-way reviews', text: 'After completion, companies and freelancers review each other.' },
  { icon: Bell, title: 'Status notifications', text: 'Get notified when proposals change status or a demo is viewed.' },
]
export default function Features() {
  return (
    <Section id="features" eyebrow="Features" title="Everything you need to hire and get hired" subtitle="A focused set of tools for the full project lifecycle.">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-4">
            <span className="h-fit rounded-lg bg-brand-50 p-2.5 text-brand-600"><Icon className="size-5" aria-hidden /></span>
            <div><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-1 text-slate-600">{text}</p></div>
          </div>
        ))}
      </div>
    </Section>
  )
}
