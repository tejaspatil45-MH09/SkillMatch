import { Building2, Globe, MapPin, Pencil, Star } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import Avatar from '../ui/Avatar'
import ReviewList from './ReviewList'

export default function CompanyProfile({ profile, isOwner, onEdit, reportButton }) {
  const p = profile.profile
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={profile.name} src={p.logo} size="lg" className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h1 className="text-2xl font-semibold text-slate-900">{profile.name}</h1>{p.industry && <p className="text-slate-600">{p.industry}</p>}</div>
              {!isOwner && reportButton}
              {isOwner && <Button variant="secondary" onClick={onEdit}><Pencil className="size-4" aria-hidden />Edit profile</Button>}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-slate-600">
              {p.location && <li className="flex items-center gap-1.5"><MapPin className="size-4 text-slate-400" aria-hidden />{p.location}</li>}
              {p.website && <li className="flex items-center gap-1.5"><Globe className="size-4 text-slate-400" aria-hidden /><a href={p.website} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700">{p.website.replace(/^https?:\/\//, '')}</a></li>}
              {profile.rating && <li className="flex items-center gap-1.5"><Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />{profile.rating} ({profile.reviewCount} reviews)</li>}
            </ul>
            <p className="mt-4 text-slate-700">{p.description || 'No description yet.'}</p>
          </div>
        </div>
      </Card>
      <Card className="p-6"><h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900"><Building2 className="size-4 text-slate-400" aria-hidden />Reviews from freelancers</h2><ReviewList reviews={profile.reviews} /></Card>
    </div>
  )
}
