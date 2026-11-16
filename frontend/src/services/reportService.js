import { api } from './apiClient'
export const reportService = {
  createReport: ({ targetType, targetId, reason }) => api.post('/reports', { targetType, targetId, reason }),
}
