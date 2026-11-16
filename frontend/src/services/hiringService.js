import { api } from './apiClient'
export const hiringService = {
  getHirings: () => api.get('/hirings'),
  getHiring: (id) => api.get(`/hirings/${id}`),
  // Hirings are created server-side when a shortlisted proposal is accepted.
  createHiring: (proposalId) => api.post(`/proposals/${proposalId}/accept`),
  completeHiring: (id) => api.post(`/hirings/${id}/complete`),
  cancelHiring: (id, reason) => api.post(`/hirings/${id}/cancel`, { reason }),
}
