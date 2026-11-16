import { api } from './apiClient'
// Later: same calls against Express; session moves to an httpOnly cookie.
export const authService = {
  login: ({ email, password }) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/auth/me').then((r) => r.user),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: ({ token, password }) => api.post('/auth/reset-password', { token, password }),
}
