import { readFileSync } from 'node:fs'

/**
 * Clears localStorage and reloads the app so it starts from initialData.
 * Waits until at least one skill node is visible in the builder canvas.
 */
export const startFresh = async (page) => {
  await page.goto('/')
  // Clear any previously saved state so the app loads with initialData from data.js
  await page.evaluate(() => localStorage.removeItem('roadmap-skilltree.document.v1'))
  await page.reload()
  // Wait for the skill nodes to be rendered in the SVG canvas
  await page.waitForSelector('foreignObject.skill-node-export-anchor', { timeout: 15_000 })
}

/**
 * Reads a Playwright download event to a string.
 * Uses the temporary file path that Playwright persists the download to.
 */
export const readDownload = async (download) => {
  const filePath = await download.path()
  return readFileSync(filePath, 'utf-8')
}

/**
 * Returns the data-export-label attributes of all rendered skill nodes in the builder canvas.
 */
export const getBuilderNodeLabels = async (page) => {
  return page
    .locator('foreignObject.skill-node-export-anchor')
    .evaluateAll((elements) => elements.map((el) => el.getAttribute('data-export-label')))
}

/**
 * Triggers an HTML export via Ctrl+S and returns the downloaded file text.
 */
export const exportHtml = async (page) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ])
  return readDownload(download)
}

/**
 * Extracts the embedded JSON payload from an exported HTML string.
 * Returns parsed payload object or throws if not found.
 */
export const extractJsonPayload = (htmlText) => {
  const jsonMatch = htmlText.match(
    /<script[^>]*id="skilltree-export-data"[^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!jsonMatch) throw new Error('No embedded JSON payload found in HTML')
  return JSON.parse(jsonMatch[1].trim())
}
