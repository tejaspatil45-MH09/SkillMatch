import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import LoadingSpinner from '../../components/ui/LoadingSpinner'
import ProjectForm from '../../components/project/ProjectForm'
import { useAsync } from '../../hooks/useAsync'
import { useToast } from '../../context/ToastContext'
import { projectService } from '../../services/projectService'

// One page for both /create and /:projectId/edit
export default function ProjectFormPage() {
  const { projectId } = useParams()
  const editing = !!projectId
  const navigate = useNavigate()
  const toast = useToast()
  const skills = useAsync(() => projectService.getSkills(), [])
  const project = useAsync(() => (editing ? projectService.getProject(projectId) : Promise.resolve(null)), [projectId])
  const back = editing ? `/company/projects/${projectId}` : '/company/projects'

  async function onSubmit(data) {
    try {
      const saved = editing ? await projectService.updateProject(projectId, data) : await projectService.createProject(data)
      toast(editing ? 'Project updated.' : 'Project posted. Freelancers can now send proposals.'); navigate(`/company/projects/${saved.id}`)
    } catch (e) { toast(e.message, 'error') }
  }
  const err = skills.error ?? project.error
  if (err) return <ErrorState message={err.message} onRetry={() => { skills.reload(); project.reload() }} />
  if (!skills.data || (editing && !project.data)) return <LoadingSpinner />
  const p = project.data
  return (
    <div className="mx-auto max-w-3xl">
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" aria-hidden />Back</Link>
      {editing && p.status !== 'OPEN' ? <EmptyState title="This project can't be edited" description="Only open projects can be edited." action={<Button as={Link} to={back} variant="secondary">Back to project</Button>} />
        : <Card className="p-6"><h1 className="mb-6 text-xl font-semibold text-slate-900">{editing ? 'Edit project' : 'Create a project'}</h1>
          <ProjectForm initial={p} allSkills={skills.data} lockSkills={editing && p.proposalCount > 0} submitLabel={editing ? 'Save changes' : 'Post project'} onSubmit={onSubmit} onCancel={() => navigate(back)} /></Card>}
    </div>
  )
}
