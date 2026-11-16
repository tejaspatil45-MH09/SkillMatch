import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RouteEffects from './RouteEffects'
import ProtectedRoute, { GuestRoute } from './ProtectedRoute'
import PublicLayout from '../components/layout/PublicLayout'
import AuthLayout from '../components/layout/AuthLayout'
import DashboardLayout from '../components/layout/DashboardLayout'
import Landing from '../pages/public/Landing'
import NotFound from '../pages/public/NotFound'
import Login from '../pages/auth/Login'
import Register from '../pages/auth/Register'
import ForgotPassword from '../pages/auth/ForgotPassword'
import ResetPassword from '../pages/auth/ResetPassword'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import FreelancerDashboard from '../pages/freelancer/Dashboard'
import FreelancerProfilePage from '../pages/freelancer/Profile'
import FreelancerProposals from '../pages/freelancer/Proposals'
import ProposalDetail from '../pages/freelancer/ProposalDetail'
import ProjectDiscovery from '../pages/projects/ProjectDiscovery'
import ProjectDetail from '../pages/projects/ProjectDetail'
import SubmitProposal from '../pages/projects/SubmitProposal'
import CompanyDashboard from '../pages/company/Dashboard'
import CompanyProfilePage from '../pages/company/Profile'
import CompanyProjects from '../pages/company/Projects'
import ProjectFormPage from '../pages/company/ProjectFormPage'
import CompanyProjectDetail from '../pages/company/ProjectDetail'
import ProjectProposals from '../pages/company/ProjectProposals'
import ProposalsInbox from '../pages/company/ProposalsInbox'
import FreelancerView from '../pages/company/FreelancerView'
import SubmitDemo from '../pages/freelancer/SubmitDemo'
import DemoAccess from '../pages/company/DemoAccess'
import Hirings from '../pages/shared/Hirings'
import HiringDetail from '../pages/shared/HiringDetail'
import CompanyView from '../pages/company/CompanyView'
import Notifications from '../pages/shared/Notifications'
const AdminDashboard = lazy(() => import('../pages/admin/Dashboard')) // pulls in the charting library only for admins
const AdminAnalytics = lazy(() => import('../pages/admin/Analytics'))
import AdminUsers from '../pages/admin/Users'
import AdminProjects from '../pages/admin/Projects'
import AdminReports from '../pages/admin/Reports'
import AdminSkills from '../pages/admin/Skills'
import { useAuth } from '../context/AuthContext'
import { ROLE_HOME } from '../utils/constants'



function RoleRedirect() {
  const { user, status } = useAuth()
  if (status === 'loading') return <LoadingSpinner />
  return <Navigate to={user ? ROLE_HOME[user.role] : '/login'} replace />
}

export default function AppRoutes() {
  return (
    <>
    <RouteEffects />
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Landing />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route element={<GuestRoute />}>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<RoleRedirect />} />
        <Route element={<DashboardLayout />}>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/projects" element={<ProjectDiscovery />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route element={<ProtectedRoute roles={['FREELANCER']} />}>
            <Route path="/projects/:projectId/proposal" element={<SubmitProposal />} />
            <Route path="/freelancer/dashboard" element={<FreelancerDashboard />} />
            <Route path="/freelancer/profile" element={<FreelancerProfilePage />} />
            <Route path="/freelancer/proposals" element={<FreelancerProposals />} />
            <Route path="/freelancer/proposals/:proposalId" element={<ProposalDetail />} />
            <Route path="/freelancer/proposals/:proposalId/demo" element={<SubmitDemo />} />
            <Route path="/freelancer/hirings" element={<Hirings />} />
            <Route path="/freelancer/hirings/:hiringId" element={<HiringDetail />} />
          </Route>
          <Route element={<ProtectedRoute roles={['COMPANY']} />}>
            <Route path="/company/dashboard" element={<CompanyDashboard />} />
            <Route path="/company/profile" element={<CompanyProfilePage />} />
            <Route path="/company/projects" element={<CompanyProjects />} />
            <Route path="/company/projects/create" element={<ProjectFormPage />} />
            <Route path="/company/projects/:projectId" element={<CompanyProjectDetail />} />
            <Route path="/company/projects/:projectId/edit" element={<ProjectFormPage />} />
            <Route path="/company/projects/:projectId/proposals" element={<ProjectProposals />} />
            <Route path="/company/proposals" element={<ProposalsInbox />} />
            <Route path="/company/proposals/:proposalId/demo" element={<DemoAccess />} />
            <Route path="/company/hirings" element={<Hirings />} />
            <Route path="/company/hirings/:hiringId" element={<HiringDetail />} />
          </Route>
          <Route element={<ProtectedRoute roles={['FREELANCER', 'ADMIN']} />}><Route path="/companies/:userId" element={<CompanyView />} /></Route>
          <Route element={<ProtectedRoute roles={['COMPANY', 'ADMIN']} />}><Route path="/freelancers/:userId" element={<FreelancerView />} /></Route>
          <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin/dashboard" element={<Suspense fallback={<LoadingSpinner />}><AdminDashboard /></Suspense>} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/projects" element={<AdminProjects />} />
            <Route path="/admin/analytics" element={<Suspense fallback={<LoadingSpinner />}><AdminAnalytics /></Suspense>} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/skills" element={<AdminSkills />} /></Route>
        </Route>
      </Route>
    </Routes>
    </>
  )
}
