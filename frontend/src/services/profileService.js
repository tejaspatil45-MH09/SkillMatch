import { api } from './apiClient'
export const profileService = {
  getProfile: (userId) => api.get(`/profiles/${userId}`),
  updateMyProfile: (data) => api.put('/profiles/me', data),
  getFreelancerDashboard: () => api.get('/freelancer/dashboard'),
  getCompanyDashboard: () => api.get('/company/dashboard'),
}
