import { api } from './apiClient'
export const reviewService = {
  createReview: (data) => api.post('/reviews', data),
  getReviews: (userId) => api.get('/reviews', { userId }),
}
