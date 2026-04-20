import { defineConfig, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const artifactsRoot = resolve(process.env.SKILLTREE_TEST_ARTIFACTS_DIR ?? 'tests/results')
const formatRunStamp = (date) => {
  const pad2 = (value) => String(value).padStart(2, '0')
  return [
    String(date.getFullYear()).slice(-2),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
  ].join('')
}

const sanitizeRunLabel = (value) => String(value ?? 'e2e')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'e2e'

const runLabel = sanitizeRunLabel(process.env.SKILLTREE_TEST_RUN_LABEL)
const runId = process.env.SKILLTREE_TEST_RUN_ID ?? `${formatRunStamp(new Date())}_${runLabel}`
const runArtifactsRoot = resolve(artifactsRoot, 'runs', runId)
const testPort = Number(process.env.SKILLTREE_TEST_PORT ?? 41731)
const baseURL = `http://127.0.0.1:${testPort}`

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
    baseURL,
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
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
