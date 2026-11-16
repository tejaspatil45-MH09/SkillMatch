import { api } from './apiClient'
export const proposalService = {
  submitProposal: (projectId, data) => api.post(`/projects/${projectId}/proposals`, data),
  getMyProposals: () => api.get('/proposals/mine'),
  getProjectProposals: (projectId) => api.get(`/projects/${projectId}/proposals`),
  getCompanyProposals: () => api.get('/company/proposals'),
  getProposal: (id) => api.get(`/proposals/${id}`),
  shortlist: (id) => api.post(`/proposals/${id}/shortlist`),
  reject: (id) => api.post(`/proposals/${id}/reject`),
  withdraw: (id) => api.post(`/proposals/${id}/withdraw`),
  accept: (id) => api.post(`/proposals/${id}/accept`),             // also creates the hiring
}
