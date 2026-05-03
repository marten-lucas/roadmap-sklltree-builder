import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { startFresh } from './helpers.js'

const MYKYANA_JSON_PATH = resolve(process.cwd(), 'tests/e2e/datasets/myKyana_2026-04-27_06-09.json')
const ZOOM_CONNECTION = {
  sourceId: '342b4e0c-302f-48ae-a19f-9f44e13b62f6',
  targetId: '298fb4c8-9cf3-4827-be67-eb06530ba741',
}

const collectRadialAxialJunctionMetrics = async (page) => {
  return page.evaluate(() => {
    const svg = document.querySelector('svg.skill-tree-canvas')
    const centerGroup = document.querySelector('.skill-tree-center-icon')
    if (!svg || !centerGroup) {
      return {
        checkedJunctionCount: 0,
        mismatchCount: 0,
        maxJunctionDriftPx: 0,
        worstJunction: null,
        mismatchSamples: [],
        debug: {
          pathCount: 0,
          candidateCount: 0,
        },
      }
    }

    const parsePathCommands = (d) => {
      const tokens = String(d ?? '').trim().match(/[MLA]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
      const commands = []
      let index = 0
      while (index < tokens.length) {
        const cmd = tokens[index++]
        if (cmd === 'M' || cmd === 'L') {
          const x = Number(tokens[index++])
          const y = Number(tokens[index++])
          commands.push({ cmd, x, y })
          continue
        }

        if (cmd === 'A') {
          const rx = Number(tokens[index++])
          const ry = Number(tokens[index++])
          const xAxisRotation = Number(tokens[index++])
          const largeArc = Number(tokens[index++])
          const sweep = Number(tokens[index++])
          const x = Number(tokens[index++])
          const y = Number(tokens[index++])
          commands.push({ cmd, rx, ry, xAxisRotation, largeArc, sweep, x, y })
          continue
        }

        break
      }

      return commands
    }

    const pathEls = Array.from(document.querySelectorAll('path[data-link-source-id][data-link-target-id]'))
    const pathMeta = pathEls.map((pathEl) => ({
      sourceId: pathEl.getAttribute('data-link-source-id') ?? '',
      targetId: pathEl.getAttribute('data-link-target-id') ?? '',
    }))

    const sampledPaths = pathEls.map((pathEl) => {
      let totalLength = 0
      try {
        totalLength = pathEl.getTotalLength()
      } catch {
        totalLength = 0
      }

      if (!Number.isFinite(totalLength) || totalLength <= 0) {
        return []
      }

      const stepPx = 0.25
      const sampleCount = Math.max(64, Math.ceil(totalLength / stepPx))
      const points = []

      for (let step = 0; step <= sampleCount; step += 1) {
        const point = pathEl.getPointAtLength((step / sampleCount) * totalLength)
        points.push({ x: point.x, y: point.y })
      }

      return points
    })

    const splitDotsByPair = new Map(
      Array.from(document.querySelectorAll('[data-split-dot-key][data-split-dot-source-id][data-split-dot-target-id]')).map((dotEl) => {
        const sourceId = dotEl.getAttribute('data-split-dot-source-id') ?? ''
        const targetId = dotEl.getAttribute('data-split-dot-target-id') ?? ''
        const cx = Number(dotEl.getAttribute('cx'))
        const cy = Number(dotEl.getAttribute('cy'))
        return [`${sourceId}|${targetId}`, { x: cx, y: cy }]
      }),
    )

    const candidateJunctions = []

    pathEls.forEach((pathEl, pathIndex) => {
      const commands = parsePathCommands(pathEl.getAttribute('d'))
      let cursor = null
      let previousCommand = null

      commands.forEach((command) => {
        if (!cursor) {
          cursor = { x: command.x, y: command.y }
          previousCommand = command
          return
        }

        const nextPoint = { x: command.x, y: command.y }
        const meta = pathMeta[pathIndex] ?? { sourceId: '', targetId: '' }
        const pairKey = `${meta.sourceId}|${meta.targetId}`

        // Only evaluate true branch points that intentionally render split dots.
        // This avoids counting arc elbows that are not shared-trunk T-junctions.
        if (command.cmd === 'L' && previousCommand?.cmd === 'A' && splitDotsByPair.has(pairKey)) {
          const dotPoint = splitDotsByPair.get(pairKey)
          candidateJunctions.push({
            pathIndex,
            point: dotPoint ?? { ...cursor },
          })
        }

        cursor = nextPoint
        previousCommand = command
      })
    })

    const nearestDistanceToSiblingPath = (point, ownPathIndex) => {
      let minDistance = Number.POSITIVE_INFINITY
      const ownMeta = pathMeta[ownPathIndex] ?? { sourceId: '', targetId: '' }

      for (let pathIndex = 0; pathIndex < sampledPaths.length; pathIndex += 1) {
        if (pathIndex === ownPathIndex) continue
        const meta = pathMeta[pathIndex] ?? { sourceId: '', targetId: '' }
        if (!ownMeta.sourceId || meta.sourceId !== ownMeta.sourceId) continue
        if (meta.targetId === ownMeta.targetId) continue

        const points = sampledPaths[pathIndex]
        for (const sample of points) {
          const distance = Math.hypot(point.x - sample.x, point.y - sample.y)
          if (distance < minDistance) {
            minDistance = distance
          }
          if (minDistance < 0.02) {
            return minDistance
          }
        }
      }

      return minDistance
    }

    const sharedJunctionDetectionPx = 8
    const mismatchThresholdPx = 0.12

    let checkedJunctionCount = 0
    let mismatchCount = 0
    let maxJunctionDriftPx = 0
    let worstJunction = null
    const mismatchSamples = []

    for (const junction of candidateJunctions) {
      const nearestOtherPathDistance = nearestDistanceToSiblingPath(junction.point, junction.pathIndex)
      if (!Number.isFinite(nearestOtherPathDistance)) {
        continue
      }
      if (nearestOtherPathDistance > sharedJunctionDetectionPx) {
        continue
      }

      checkedJunctionCount += 1

      if (nearestOtherPathDistance > maxJunctionDriftPx) {
        maxJunctionDriftPx = nearestOtherPathDistance
        worstJunction = {
          x: junction.point.x,
          y: junction.point.y,
          driftPx: nearestOtherPathDistance,
        }
      }

      if (nearestOtherPathDistance > mismatchThresholdPx) {
        mismatchCount += 1
        if (mismatchSamples.length < 24) {
          const meta = pathMeta[junction.pathIndex] ?? { sourceId: '', targetId: '' }
          mismatchSamples.push({
            sourceId: meta.sourceId,
            targetId: meta.targetId,
            x: junction.point.x,
            y: junction.point.y,
            driftPx: nearestOtherPathDistance,
          })
        }
      }
    }

    return {
      checkedJunctionCount,
      mismatchCount,
      maxJunctionDriftPx,
      worstJunction,
      mismatchSamples,
      debug: {
        pathCount: pathEls.length,
        candidateCount: candidateJunctions.length,
      },
    }
  })
}

const withZoomedConnectionViewBox = async (page, sourceId, targetId, callback) => {
  const zoomState = await page.evaluate(({ source, target }) => {
    const svg = document.querySelector('svg.skill-tree-canvas')
    const path = document.querySelector(
      `path[data-link-source-id="${source}"][data-link-target-id="${target}"]`,
    )
    if (!svg || !path) return null

    const bbox = path.getBBox()
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height) || bbox.width <= 0 || bbox.height <= 0) {
      return null
    }

    const current = svg.getAttribute('viewBox')
    const fallbackViewBox = `0 0 ${svg.viewBox.baseVal.width} ${svg.viewBox.baseVal.height}`
    const previousViewBox = current && current.trim().length > 0 ? current : fallbackViewBox

    const pad = Math.max(42, Math.max(bbox.width, bbox.height) * 0.65)
    const x = bbox.x - pad
    const y = bbox.y - pad
    const width = bbox.width + pad * 2
    const height = bbox.height + pad * 2
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)

    return { previousViewBox }
  }, { source: sourceId, target: targetId })

  if (!zoomState) {
    return false
  }

  try {
    await callback()
  } finally {
    await page.evaluate(({ viewBox }) => {
      const svg = document.querySelector('svg.skill-tree-canvas')
      if (!svg) return
      svg.setAttribute('viewBox', viewBox)
    }, { viewBox: zoomState.previousViewBox })
  }

  return true
}

test.describe('radial/axial junction alignment', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('myKyana JSON import keeps radial starts exactly on axial trunks', async ({ page }, testInfo) => {
    await startFresh(page)

    await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(MYKYANA_JSON_PATH)
    await page.waitForSelector('foreignObject.skill-node-export-anchor .skill-node-button', { timeout: 20_000 })

    await page.getByRole('button', { name: 'Fit to screen' }).click()
    await page.waitForTimeout(900)

    const metrics = await collectRadialAxialJunctionMetrics(page)

    await testInfo.attach('radial-axial-junction-metrics', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    })

    const zoomedCaptured = await withZoomedConnectionViewBox(
      page,
      ZOOM_CONNECTION.sourceId,
      ZOOM_CONNECTION.targetId,
      async () => {
        await expect(page.locator('svg.skill-tree-canvas')).toHaveScreenshot('radial-axial-alignment-zoomed-connection.png', {
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          maxDiffPixels: 45,
        })
      },
    )
    expect(zoomedCaptured, 'Could not locate zoom-target connection path').toBeTruthy()

    await expect(page.locator('svg.skill-tree-canvas')).toHaveScreenshot('radial-axial-alignment-mykyana-json.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      maxDiffPixels: 180,
    })

    expect(metrics.checkedJunctionCount, 'No radial/axial junctions were detected for verification').toBeGreaterThan(0)
    expect(
      metrics.mismatchCount,
      `Found ${metrics.mismatchCount} mismatched radial/axial junction(s); worst drift=${metrics.maxJunctionDriftPx.toFixed(4)}px`,
    ).toBe(0)
    expect(metrics.maxJunctionDriftPx).toBeLessThanOrEqual(0.12)
  })
})