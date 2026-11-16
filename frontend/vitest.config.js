import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Integration tests run the real React app against the real Express + PostgreSQL backend (no mocks).
// They need TEST_DATABASE_URL: a throwaway database whose name contains "test" (it is wiped on every run).
// TEST_DATABASE_URL lives in ../backend/.env (the backend is what the integration tests exercise)
try { process.loadEnvFile(new URL('../backend/.env', import.meta.url)) } catch { /* set TEST_DATABASE_URL in the environment instead */ }

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_USE_MOCK': '"false"', 'import.meta.env.VITE_API_URL': '"/api"' },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{js,jsx}'],
    globalSetup: ['./test/globalSetup.js'],
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 60000,
    env: { NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
  },
})
