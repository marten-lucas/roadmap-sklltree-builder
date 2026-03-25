import { defineConfig, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const artifactsRoot = resolve(process.env.SKILLTREE_TEST_ARTIFACTS_DIR ?? 'tests/results')
const runId = process.env.SKILLTREE_TEST_RUN_ID ?? `${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}-${process.pid}`
const runArtifactsRoot = resolve(artifactsRoot, 'runs', runId)

mkdirSync(resolve(runArtifactsRoot, 'reports'), { recursive: true })
mkdirSync(resolve(runArtifactsRoot, 'playwright'), { recursive: true })

process.env.SKILLTREE_TEST_RUN_ID = runId
process.env.SKILLTREE_E2E_EXPORT_DIR = resolve(runArtifactsRoot, 'e2e-exports')
process.env.SKILLTREE_E2E_METRICS_DIR = resolve(runArtifactsRoot, 'e2e-metrics')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  outputDir: resolve(runArtifactsRoot, 'playwright'),
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(runArtifactsRoot, 'reports/playwright-results.json') }],
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
