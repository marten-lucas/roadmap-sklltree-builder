import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
  },
})
