import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import CompanyProfile from '../../components/profile/CompanyProfile'
import EditCompanyModal from '../../components/profile/EditCompanyModal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'

export default function Profile() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const { data, error, reload } = useAsync(() => profileService.getProfile(user.id), [user.id])
  const [editing, setEditing] = useState(false)
  async function save(payload) {
    try { await profileService.updateMyProfile(payload); toast('Company profile updated.'); setEditing(false); await refresh(); reload() }
    catch (e) { toast(e.message, 'error') }
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data) return <LoadingSpinner label="Loading profile" />
  return (
    <div>
      <PageHeader title="Company profile" description="This is how freelancers see your company." />
      <CompanyProfile profile={data} isOwner onEdit={() => setEditing(true)} />
      {editing && <EditCompanyModal open onClose={() => setEditing(false)} profile={data} onSave={save} />}
    </div>
  )
}
