import { Briefcase, MapPin, Pencil, Plus } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import EmptyState from '../ui/EmptyState'
import ProgressBar from '../ui/ProgressBar'
import SkillsList from './SkillsList'
import PortfolioCard from './PortfolioCard'
import ReviewList, { Stars } from './ReviewList'

const Section = ({ title, action, children }) => <Card className="p-6"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>{children}</Card>

// Reusable: owner view (editable) and, later, the company's read-only view
export default function FreelancerProfile({ profile, isOwner, onEdit, onAddPortfolio, onDeletePortfolio, reportButton }) {
  const p = profile.profile
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={profile.name} src={p.photo} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h1 className="text-2xl font-semibold text-slate-900">{profile.name}</h1><p className="text-slate-600">{p.headline || 'No headline yet'}</p></div>
              {!isOwner && reportButton}
              {isOwner && <Button variant="secondary" onClick={onEdit}><Pencil className="size-4" aria-hidden />Edit profile</Button>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-slate-600">
              {p.location && <span className="flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" aria-hidden />{p.location}</span>}
              {p.experienceYears != null && <span className="flex items-center gap-1.5"><Briefcase className="size-4 text-slate-400" aria-hidden />{p.experienceYears} {p.experienceYears === 1 ? 'year' : 'years'} experience</span>}
              {profile.rating && <span className="flex items-center gap-1.5"><Stars value={profile.rating} />{profile.rating} ({profile.reviewCount})</span>}
            </div>
            {p.bio && <p className="mt-4 text-slate-700">{p.bio}</p>}
            {isOwner && profile.profileCompletion != null && (
              <div className="mt-5 max-w-sm"><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-700">Profile completion</span><span className="text-slate-500">{profile.profileCompletion}%</span></div><ProgressBar value={profile.profileCompletion} label="Profile completion" /></div>)}
          </div>
        </div>
      </Card>
      <Section title="Skills">{p.skills.length ? <SkillsList skills={p.skills} /> : <p className="text-slate-500">No skills added yet.</p>}</Section>
      <Section title="Portfolio" action={isOwner && <Button variant="secondary" size="sm" onClick={onAddPortfolio}><Plus className="size-4" aria-hidden />Add project</Button>}>
        {p.portfolio.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{p.portfolio.map((i) => <PortfolioCard key={i.id} item={i} onDelete={isOwner ? onDeletePortfolio : undefined} />)}</div>
          : <EmptyState title="No portfolio projects" description={isOwner ? 'Add past work so companies can see what you can build.' : 'This freelancer has not added portfolio projects.'} />}
      </Section>
      <Section title="Experience">
        {p.experience.length ? <ul className="space-y-4">{p.experience.map((e) => <li key={e.id}><p className="font-medium text-slate-900">{e.role} · {e.org}</p><p className="text-xs text-slate-500">{e.period}</p><p className="mt-1 text-slate-600">{e.summary}</p></li>)}</ul> : <p className="text-slate-500">No experience entries yet.</p>}
      </Section>
      <Section title="Reviews"><ReviewList reviews={profile.reviews} /></Section>
    </div>
  )
}
