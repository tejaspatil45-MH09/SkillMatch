import { api } from './apiClient'
export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  suspendUser: (id) => api.post(`/admin/users/${id}/suspend`),
  reinstateUser: (id) => api.post(`/admin/users/${id}/reinstate`),
  getProjects: () => api.get('/admin/projects'),
  getReports: () => api.get('/admin/reports'),
  resolveReport: (id) => api.post(`/admin/reports/${id}/resolve`),
  getSkills: () => api.get('/admin/skills'),
  addSkill: (name) => api.post('/admin/skills', { name }),
  deleteSkill: (id) => api.delete(`/admin/skills/${id}`),
  // Reports & analytics (real backend only). `query` is the output of filtersToQuery().
  getAnalytics: (query) => api.get('/admin/analytics', query),
  exportAnalytics: (query) => api.text('/admin/analytics/export', query),
  resetDemoData: () => api.post('/dev/reset'),
}
