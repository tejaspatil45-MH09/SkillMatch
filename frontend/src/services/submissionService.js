import { api } from './apiClient'
// Work submissions for a hiring. Real backend only: there is no mock for these endpoints.
export const submissionService = {
  list: (hiringId) => api.get(`/hirings/${hiringId}/submissions`),
  submit: (hiringId, data) => api.post(`/hirings/${hiringId}/submissions`, data),
  approve: (hiringId, submissionId) => api.post(`/hirings/${hiringId}/submissions/${submissionId}/approve`),
  requestRevision: (hiringId, submissionId, feedback) => api.post(`/hirings/${hiringId}/submissions/${submissionId}/request-revision`, { feedback }),
}
