import { test, expect } from '@playwright/test'

const RELEASE_ID = 'rel-budget-test-001'
const NODE_ID = 'node-budget-test-001'
const LEVEL_ID = 'level-budget-test-001'

/**
 * Builds a minimal document (schema v3) with one release (budget=20) and one node
 * with effort 'm' (5 SP) and status 'now' for that release.
 * The localStorage value must be { schemaVersion: 3, document: {...} }.
 * Level statuses use the v3 format: statuses: { [releaseId]: 'now' }.
 */
const buildMinimalBudgetPersistedPayload = (budgetOverride = 20) => {
  const doc = {
    systemName: 'Budget Test',
    releases: [
      {
        id: RELEASE_ID,
        name: 'v1.0',
        motto: '',
        introduction: '',
        date: '',
        storyPointBudget: budgetOverride,
      },
    ],
    storyPointMap: { xs: 1, s: 3, m: 5, l: 8, xl: 13 },
    segments: [{ id: 'seg-001', label: 'Core' }],
    scopes: [],
    showHiddenNodes: false,
    children: [
      {
        id: NODE_ID,
        label: 'Minimal Node',
        shortName: 'MIN',
        segmentId: 'seg-001',
        effort: { size: 'm' },
        benefit: { size: 'unclear' },
        children: [],
        levels: [
          {
            id: LEVEL_ID,
            label: 'Level 1',
            releaseNote: '**First milestone** is ready.',
            statuses: { [RELEASE_ID]: 'now' },
            scopeIds: [],
            effort: { size: 'm' },
            benefit: { size: 'unclear' },
          },
        ],
      },
    ],
  }
  return { schemaVersion: 3, document: doc }
}

test.describe('Release budget chip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, buildMinimalBudgetPersistedPayload(20))
    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', {
      state: 'attached',
      timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Export', exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
  })

  test('shows the budget chip next to the release selector', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err))

    // The chip should be visible: 5/20 SP (m node = 5 story points, budget = 20)
    const chip = page.getByText('5/20 SP')
    await expect(chip).toBeVisible()

    expect(pageErrors).toHaveLength(0)
  })

  test('chip turns red when budget is exceeded', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(err))

    // Inject a document where total (5 SP) exceeds budget (3)
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, buildMinimalBudgetPersistedPayload(3))
    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', {
      state: 'attached',
      timeout: 15_000,
    })

    const chip = page.getByText('5/3 SP')
    await expect(chip).toBeVisible()

    // Chip should have a red color style
    const color = await chip.evaluate((el) => getComputedStyle(el).color)
    // #f87171 -> rgb(248, 113, 113) in the browser
    expect(color).toMatch(/248.*113.*113|f87171/i)

    expect(pageErrors).toHaveLength(0)
  })

  test('chip is hidden when no budget is set', async ({ page }) => {
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, buildMinimalBudgetPersistedPayload(null))
    await page.reload()
    await page.waitForSelector('foreignObject.skill-node-export-anchor', {
      state: 'attached',
      timeout: 15_000,
    })

    // No x/y SP chip should be present
    await expect(page.getByText(/\d+\/\d+ SP/)).toHaveCount(0)
  })
})
