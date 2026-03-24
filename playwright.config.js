import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'
import process from 'node:process'

const artifactsRoot = resolve(process.env.SKILLTREE_TEST_ARTIFACTS_DIR ?? 'tests/results')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: resolve(artifactsRoot, 'playwright'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(artifactsRoot, 'reports/playwright-results.json') }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
