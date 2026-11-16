import { api } from './apiClient'
export const demoService = {
  submitDemo: (proposalId, data) => api.post(`/proposals/${proposalId}/demo`, data),
  checkAccess: (proposalId) => api.get(`/proposals/${proposalId}/demo`),   // status only, never the URL
  accessDemo: (demoId) => api.post(`/demos/${demoId}/access`),            // single-use; returns the URL
  reissueDemo: (demoId) => api.post(`/demos/${demoId}/reissue`),
}
