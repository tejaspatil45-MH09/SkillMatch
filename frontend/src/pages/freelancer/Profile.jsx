import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import ErrorState from '../../components/ui/ErrorState'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import FreelancerProfile from '../../components/profile/FreelancerProfile'
import EditProfileModal from '../../components/profile/EditProfileModal'
import PortfolioModal from '../../components/profile/PortfolioModal'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { profileService } from '../../services/profileService'
import { projectService } from '../../services/projectService'

export default function Profile() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const { data, error, reload } = useAsync(() => profileService.getProfile(user.id), [user.id])
  const skills = useAsync(() => projectService.getSkills(), [])
  const [modal, setModal] = useState(null)       // 'edit' | 'portfolio'
  const [deleting, setDeleting] = useState(null)

  async function update(payload, message) {
    try { await profileService.updateMyProfile(payload); toast(message); setModal(null); setDeleting(null); await refresh(); reload() }
    catch (e) { toast(e.message, 'error') }
  }
  if (error) return <ErrorState message={error.message} onRetry={reload} />
  if (!data) return <LoadingSpinner label="Loading profile" />
  const portfolio = data.profile.portfolio
  return (
    <div>
      <PageHeader title="My profile" description="This is how companies see you on SkillMatch." />
      <FreelancerProfile profile={data} isOwner onEdit={() => setModal('edit')} onAddPortfolio={() => setModal('portfolio')} onDeletePortfolio={setDeleting} />
      {modal === 'edit' && skills.data && <EditProfileModal open onClose={() => setModal(null)} profile={data} allSkills={skills.data} onSave={(p) => update(p, 'Profile updated.')} />}
      {modal === 'portfolio' && <PortfolioModal open onClose={() => setModal(null)} onSave={(item) => update({ profile: { portfolio: [...portfolio, { id: `pf-${Date.now()}`, ...item }] } }, 'Portfolio project added.')} />}
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} danger title="Remove portfolio project?" confirmLabel="Remove"
        message={deleting && `"${deleting.title}" will be removed from your profile.`} onConfirm={() => update({ profile: { portfolio: portfolio.filter((i) => i.id !== deleting.id) } }, 'Portfolio project removed.')} />
    </div>
  )
}
