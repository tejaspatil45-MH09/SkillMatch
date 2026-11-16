import { useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import FreelancerProfile from '../../components/profile/FreelancerProfile'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'
import { useAuth } from '../../context/AuthContext'
import { useReport } from '../../hooks/useReport'

// Read-only freelancer profile for companies
export default function FreelancerView() {
  const { userId } = useParams()
  const { user } = useAuth()
  const report = useReport({ targetType: 'USER', targetId: userId, label: 'this freelancer' })
  const { data, error, reload } = useAsync(() => profileService.getProfile(userId), [userId])
  const back = <button onClick={() => history.back()} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back</button>
  if (error) return <div>{back}<ErrorState message={error.message} onRetry={reload} /></div>
  if (!data) return <LoadingSpinner label="Loading profile" />
  if (data.role !== 'FREELANCER') return <div>{back}<ErrorState message="This profile is not a freelancer profile." /></div>
  return <div>{back}<FreelancerProfile profile={data} isOwner={false} reportButton={user.role !== 'ADMIN' && report.button} />{report.modal}</div>
}
