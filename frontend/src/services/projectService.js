import { api } from './apiClient'
export const projectService = {
  getProjects: (filters) => api.get('/projects', filters),            // GET /api/projects
  getProject: (id) => api.get(`/projects/${id}`),
  getCompanyProjects: () => api.get('/company/projects'),
  createProject: (data) => api.post('/projects', data),
  updateProject: (id, data) => api.put(`/projects/${id}`, data),
  closeProject: (id) => api.post(`/projects/${id}/close`),
  getSkills: () => api.get('/skills'),
}
