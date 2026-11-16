import { api } from './apiClient'
// The conversation attached to a hiring. Real backend only: there is no mock for these endpoints.
export const messageService = {
  list: (hiringId) => api.get(`/hirings/${hiringId}/messages`),
  send: (hiringId, body) => api.post(`/hirings/${hiringId}/messages`, { body }),
  markRead: (hiringId) => api.post(`/hirings/${hiringId}/messages/read`),
}
