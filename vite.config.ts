import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0' },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
