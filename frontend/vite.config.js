import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// With VITE_USE_MOCK=false the app calls /api/... on this dev server, which forwards it to the Express backend.
// One origin means the session cookie is first-party and there is no CORS to configure in development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:5000', changeOrigin: false } } },
})
