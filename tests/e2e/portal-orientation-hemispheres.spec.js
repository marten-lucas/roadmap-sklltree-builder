import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

const ORIENTATION_PAYLOAD = {
  schemaVersion: 3,
  document: {
    systemName: 'Portal Orientation Seed',
    segments: [
      { id: 'segment-north', label: 'North' },
      { id: 'segment-east', label: 'East' },
      { id: 'segment-south', label: 'South' },
      { id: 'segment-west', label: 'West' },
    ],
    scopes: [],
    releases: [
      {
        id: 'release-1',
        name: 'Release 1',
        motto: 'Orientation',
        introduction: '',
        voiceOfCustomer: '',
        fictionalCustomerName: '',
        date: '2026-07-01',
        storyPointBudget: null,
        statusBudgets: { now: null, next: null, later: null, someday: null, done: null, hidden: null },
        featureStatuses: { now: true, next: true, later: true, someday: false, done: false, hidden: false },
        notesMarkdown: '',
        notesChecked: {},
      },
    ],
    showHiddenNodes: false,
    children: [
      {
        id: 'node-north',
        label: 'North Node',
        shortName: 'NTH',
        segmentId: 'segment-north',
        children: [],
        levels: [
          {
            id: 'level-north',
            label: 'Level 1',
            statuses: { 'release-1': 'now' },
            releaseNote: 'North',
            scopeIds: [],
            additionalDependencyLevelIds: ['level-east'],
          },
        ],
      },
      {
        id: 'node-east',
        label: 'East Node',
        shortName: 'EST',
        segmentId: 'segment-east',
        children: [],
        levels: [
          {
            id: 'level-east',
            label: 'Level 1',
            statuses: { 'release-1': 'next' },
            releaseNote: 'East',
            scopeIds: [],
            additionalDependencyLevelIds: ['level-south'],
          },
        ],
      },
      {
        id: 'node-south',
        label: 'South Node',
        shortName: 'STH',
        segmentId: 'segment-south',
        children: [],
        levels: [
          {
            id: 'level-south',
            label: 'Level 1',
            statuses: { 'release-1': 'later' },
            releaseNote: 'South',
            scopeIds: [],
            additionalDependencyLevelIds: ['level-west'],
          },
        ],
      },
      {
        id: 'node-west',
        label: 'West Node',
        shortName: 'WST',
        segmentId: 'segment-west',
        children: [],
        levels: [
          {
            id: 'level-west',
            label: 'Level 1',
            statuses: { 'release-1': 'now' },
            releaseNote: 'West',
            scopeIds: [],
            additionalDependencyLevelIds: ['level-north'],
          },
        ],
      },
    ],
  },
}

const getPortalHemisphereSnapshot = async (page) => page.evaluate(() => {
  const centerIcon = document.querySelector('.skill-tree-center-icon__foreign')
  if (!centerIcon) {
    return null
  }

  const centerRect = centerIcon.getBoundingClientRect()
  const centerX = centerRect.left + centerRect.width / 2
  const centerY = centerRect.top + centerRect.height / 2

  const nodeAnchorById = new Map(
    [...document.querySelectorAll('foreignObject.skill-node-export-anchor')]
      .map((anchor) => [String(anchor.getAttribute('data-node-id') ?? ''), anchor]),
  )

  const portals = [...document.querySelectorAll('.skill-tree-portal[data-portal-node-id]')]
    .map((portal) => {
      const style = window.getComputedStyle(portal)
      if (style.display === 'none' || style.visibility === 'hidden') {
        return null
      }

      const nodeId = String(portal.getAttribute('data-portal-node-id') ?? '')
      const nodeAnchor = nodeAnchorById.get(nodeId)
      if (!nodeAnchor) {
        return null
      }

      const nodeRect = nodeAnchor.getBoundingClientRect()
      const nodeX = nodeRect.left + nodeRect.width / 2
      const nodeY = nodeRect.top + nodeRect.height / 2

      const portalRect = portal.getBoundingClientRect()
      const portalX = portalRect.left + portalRect.width / 2
      const portalY = portalRect.top + portalRect.height / 2

      const toCenterX = centerX - nodeX
      const toCenterY = centerY - nodeY
      const toPortalX = portalX - nodeX
      const toPortalY = portalY - nodeY

      const centerDistance = Math.hypot(toCenterX, toCenterY)
      const portalDistance = Math.hypot(toPortalX, toPortalY)
      if (centerDistance < 1 || portalDistance < 1) {
        return null
      }

      // Ignore nodes too close to the center where directional hemisphere checks are unstable.
      if (centerDistance < 36) {
        return null
      }

      const cosine = (toCenterX * toPortalX + toCenterY * toPortalY) / (centerDistance * portalDistance)

      const nodeDx = nodeX - centerX
      const nodeDy = nodeY - centerY
      const bucket = Math.abs(nodeDx) >= Math.abs(nodeDy)
        ? (nodeDx >= 0 ? 'right' : 'left')
        : (nodeDy >= 0 ? 'down' : 'up')

      const key = String(portal.getAttribute('data-portal-key') ?? '')
      const type = String(portal.getAttribute('data-portal-type') ?? (key.endsWith(':target') ? 'target' : 'source'))

      return {
        key,
        type,
        bucket,
        cosine,
      }
    })
    .filter(Boolean)

  return { portals }
})

test.describe('Portal orientation hemispheres', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('keeps requires inward and enables outward across up/down/left/right node regions', async ({ page }) => {
    await startFresh(page)
    await page.evaluate((payload) => {
      localStorage.setItem('roadmap-skilltree.document.v1', JSON.stringify(payload))
    }, ORIENTATION_PAYLOAD)
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.skill-tree-portal', { state: 'attached', timeout: 20_000 })

    // Ensure the seeded data is active.
    await expect(page.locator('foreignObject.skill-node-export-anchor[data-short-name="nth"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('foreignObject.skill-node-export-anchor[data-short-name="est"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('foreignObject.skill-node-export-anchor[data-short-name="sth"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('foreignObject.skill-node-export-anchor[data-short-name="wst"]')).toBeVisible({ timeout: 20_000 })

    await expect(page.locator('.skill-tree-portal').first()).toBeVisible({ timeout: 20_000 })

    await expect.poll(async () => {
      const snapshot = await getPortalHemisphereSnapshot(page)
      return snapshot?.portals?.length ?? 0
    }, {
      timeout: 10_000,
      message: 'Expected portal pairs to be rendered from seeded dependencies',
    }).toBeGreaterThan(0)

    const snapshot = await getPortalHemisphereSnapshot(page)
    expect(snapshot).toBeTruthy()

    const { portals } = snapshot
    expect(portals.length).toBeGreaterThan(0)

    const buckets = new Set(portals.map((portal) => portal.bucket))
    expect(buckets.has('left') || buckets.has('right')).toBe(true)
    expect(buckets.has('up') || buckets.has('down')).toBe(true)

    const sourcePortals = portals.filter((portal) => portal.type === 'source')
    const targetPortals = portals.filter((portal) => portal.type === 'target')

    expect(sourcePortals.length).toBeGreaterThan(0)
    expect(targetPortals.length).toBeGreaterThan(0)

    // Source/requires must be on the inward hemisphere (toward center).
    for (const portal of sourcePortals) {
      expect(portal.cosine, `source portal ${portal.key} in ${portal.bucket} should point inward`).toBeGreaterThan(0.12)
    }

    // Target/enables must be on the outward hemisphere (away from center).
    for (const portal of targetPortals) {
      expect(portal.cosine, `target portal ${portal.key} in ${portal.bucket} should point outward`).toBeLessThan(-0.12)
    }
  })
})
