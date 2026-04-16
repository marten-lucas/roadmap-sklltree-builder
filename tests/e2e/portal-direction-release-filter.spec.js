import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { startFresh, importCsvViaToolbar } from './helpers.js'

const KYANA_CSV_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana.csv')

const normalizeAngle = (angle) => {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const minimalAngleDelta = (leftAngle, rightAngle) => {
  const delta = Math.abs(normalizeAngle(leftAngle) - normalizeAngle(rightAngle))
  return Math.min(delta, 360 - delta)
}

const getPortalSnapshotForShortName = async (page, shortName) => page.evaluate((targetShortName) => {
  const normalize = (angle) => {
    const normalized = angle % 360
    return normalized < 0 ? normalized + 360 : normalized
  }

  const node = document.querySelector(`foreignObject.skill-node-export-anchor[data-short-name="${String(targetShortName).toLowerCase()}"]`)
  if (!node) return null

  const nodeId = node.getAttribute('data-node-id')
  const nodeRect = node.getBoundingClientRect()
  const nodeX = nodeRect.left + nodeRect.width / 2
  const nodeY = nodeRect.top + nodeRect.height / 2
  const isMinimal = Boolean(node.querySelector('.skill-node-button--minimal'))

  const portals = [...document.querySelectorAll(`.skill-tree-portal[data-portal-node-id="${nodeId}"]`)]
    .map((portal) => {
      const ring = portal.querySelector('.skill-tree-portal__ring')
      const portalRect = portal.getBoundingClientRect()
      const portalX = portalRect.left + portalRect.width / 2
      const portalY = portalRect.top + portalRect.height / 2
      const transform = ring?.getAttribute('transform') ?? ''
      const rotationMatch = transform.match(/rotate\(([-\d.]+)/)
      const rotation = rotationMatch ? Number(rotationMatch[1]) : 0
      const outwardAngle = Math.atan2(portalY - nodeY, portalX - nodeX) * 180 / Math.PI
      return {
        key: portal.getAttribute('data-portal-key'),
        type: portal.getAttribute('data-portal-key')?.endsWith(':source') ? 'source' : 'target',
        rotation: normalize(rotation),
        outwardAngle: normalize(outwardAngle),
        relativeRotation: normalize(rotation - outwardAngle),
      }
    })
    .sort((left, right) => String(left.key).localeCompare(String(right.key)))

  return {
    nodeId,
    isMinimal,
    portals,
  }
}, shortName)

test.describe('Portal direction under release filtering', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('done node MM keeps portal icon direction when switching from All to Now', async ({ page }) => {
    const csv = readFileSync(KYANA_CSV_PATH, 'utf-8')

    await startFresh(page)
    await importCsvViaToolbar(page, csv, {
      processSegments: false,
      processManualLevels: false,
    })

    const mmNode = page.locator('foreignObject.skill-node-export-anchor[data-short-name="mm"]')
    await expect(mmNode).toBeVisible({ timeout: 20_000 })
    await mmNode.click({ force: true })

    const before = await getPortalSnapshotForShortName(page, 'mm')
    expect(before).toBeTruthy()
    expect(before.isMinimal).toBe(false)
    expect(before.portals.length).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Filter' }).click()
    await page.getByRole('menuitem', { name: /Now$/ }).click()

    await expect(mmNode.locator('.skill-node-button--minimal')).toBeVisible({ timeout: 10_000 })

    const after = await getPortalSnapshotForShortName(page, 'mm')
    expect(after).toBeTruthy()
    expect(after.isMinimal).toBe(true)
    expect(after.portals.map((portal) => portal.key)).toEqual(before.portals.map((portal) => portal.key))

    for (const beforePortal of before.portals) {
      const afterPortal = after.portals.find((portal) => portal.key === beforePortal.key)
      expect(afterPortal).toBeTruthy()
      expect(minimalAngleDelta(beforePortal.relativeRotation, afterPortal.relativeRotation)).toBeLessThan(20)
    }
  })
})
