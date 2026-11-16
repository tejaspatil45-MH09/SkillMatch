import { useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import CompanyProfile from '../../components/profile/CompanyProfile'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'
import { useAuth } from '../../context/AuthContext'
import { useReport } from '../../hooks/useReport'

// Read-only company profile for freelancers (and admins)
export default function CompanyView() {
  const { userId } = useParams()
  const { user } = useAuth()
  const report = useReport({ targetType: 'USER', targetId: userId, label: 'this company' })
  const { data, error, reload } = useAsync(() => profileService.getProfile(userId), [userId])
  const back = <button onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back</button>
  if (error) return <div>{back}<ErrorState message={error.message} onRetry={reload} /></div>
  if (!data) return <LoadingSpinner label="Loading company" />
  if (data.role !== 'COMPANY') return <div>{back}<ErrorState message="This profile is not a company profile." /></div>
  return <div>{back}<CompanyProfile profile={data} isOwner={false} reportButton={user.role !== 'ADMIN' && report.button} />{report.modal}</div>
}
