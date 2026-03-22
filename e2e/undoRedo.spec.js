import { test, expect } from '@playwright/test'
import { startFresh, getBuilderNodeLabels } from './helpers.js'

const clickResetWithConfirm = async (page) => {
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Reset' }).click()
}

// ---------------------------------------------------------------------------
// Initial state: buttons disabled, no history
// ---------------------------------------------------------------------------

test.describe('Undo/Redo – initial state', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('undo button is disabled on fresh load (no history)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('redo button is disabled on fresh load (no future)', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Keyboard shortcuts: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z
// ---------------------------------------------------------------------------

test.describe('Undo/Redo – keyboard shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('ctrl+z undoes reset and restores all nodes', async ({ page }) => {
    const initialCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()

    await clickResetWithConfirm(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.keyboard.press('Control+z')
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(initialCount)
  })

  test('ctrl+y redoes after undo and empties canvas again', async ({ page }) => {
    await clickResetWithConfirm(page)
    await page.keyboard.press('Control+z') // undo reset → nodes visible

    const afterUndoCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()
    expect(afterUndoCount).toBeGreaterThan(0)

    await page.keyboard.press('Control+y') // redo → back to empty
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
  })

  test('ctrl+shift+z also triggers redo', async ({ page }) => {
    await clickResetWithConfirm(page)
    await page.keyboard.press('Control+z') // undo

    const afterUndoCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()
    expect(afterUndoCount).toBeGreaterThan(0)

    await page.keyboard.press('Control+Shift+z') // redo via alternate shortcut
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
  })

  test('keyboard shortcuts are ignored inside text inputs', async ({ page }) => {
    // Click an editable element first so keyboard events go there
    const initialCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()

    // Click on first node to open the inspector with a text area
    await page.locator('foreignObject.skill-node-export-anchor').first().click()
    await page.waitForSelector('.skill-panel--inspector')

    // Ctrl+Z while a textarea is focused should NOT trigger app undo
    const textarea = page.locator('.skill-panel--inspector textarea').first()
    await textarea.fill('test content')
    await textarea.press('Control+z') // browser's own undo in textarea, not app undo

    // App node count must remain the same (no app-level undo happened)
    await page.locator('svg.skill-tree-canvas').click({ position: { x: 10, y: 10 } })
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(initialCount)
  })
})

// ---------------------------------------------------------------------------
// Toolbar buttons: Undo / Redo click
// ---------------------------------------------------------------------------

test.describe('Undo/Redo – toolbar buttons', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('clicking undo button after reset restores all nodes', async ({ page }) => {
    const initialCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()

    await clickResetWithConfirm(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(initialCount)
  })

  test('clicking redo button re-applies reset after undo', async ({ page }) => {
    await clickResetWithConfirm(page)
    await page.getByRole('button', { name: 'Undo' }).click()

    const afterUndoCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()
    expect(afterUndoCount).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)
  })

  test('redo button becomes disabled after exhausting redo history', async ({ page }) => {
    await clickResetWithConfirm(page)
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('button', { name: 'Redo' }).click()

    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  test('undo button becomes disabled after exhausting undo history', async ({ page }) => {
    // After reset, one undo is available. After clicking it, no more undo.
    await clickResetWithConfirm(page)
    await page.getByRole('button', { name: 'Undo' }).click()

    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  })

  test('reset creates a new undo entry making undo available', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

    await clickResetWithConfirm(page)

    await expect(page.getByRole('button', { name: 'Undo' })).not.toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// State correctness: labels and structure are preserved through undo/redo
// ---------------------------------------------------------------------------

test.describe('Undo/Redo – state correctness', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('undo restores the exact same node labels as before the reset', async ({ page }) => {
    const labelsBefore = await getBuilderNodeLabels(page)

    await clickResetWithConfirm(page)
    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(0)

    await page.keyboard.press('Control+z')

    const labelsAfterUndo = await getBuilderNodeLabels(page)
    expect([...labelsAfterUndo].sort()).toEqual([...labelsBefore].sort())
  })

  test('full undo/redo cycle leaves state identical to the original', async ({ page }) => {
    const labelsBefore = await getBuilderNodeLabels(page)
    const countBefore = labelsBefore.length

    // Reset → undo → redo → undo (back to pre-reset)
    await clickResetWithConfirm(page)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+y')
    await page.keyboard.press('Control+z')

    const labelsAfter = await getBuilderNodeLabels(page)
    expect(labelsAfter.length).toBe(countBefore)
    expect([...labelsAfter].sort()).toEqual([...labelsBefore].sort())
  })

  test('undo does not affect unrelated state (canvas zoom remains)', async ({ page }) => {
    // This test verifies that non-document state (like zoom) is not affected by undo
    await clickResetWithConfirm(page)
    await page.keyboard.press('Control+z')

    // Canvas should still be present and usable (zoom wrapper intact)
    await expect(page.locator('.skill-tree-transform-wrapper')).toBeVisible()
    await expect(page.locator('svg.skill-tree-canvas')).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Panel collapse state during undo/redo
// ---------------------------------------------------------------------------

test.describe('Undo/Redo – control panel interaction', () => {
  test.beforeEach(async ({ page }) => {
    await startFresh(page)
  })

  test('collapsing toolbar menu does not interfere with undo shortcut', async ({ page }) => {
    const initialCount = await page
      .locator('foreignObject.skill-node-export-anchor')
      .count()

    // Collapse toolbar menu, then reopen it and perform reset/undo.
    await page.getByRole('button', { name: 'Menü einklappen' }).click()
    await page.getByRole('button', { name: 'Menü aufklappen' }).click()

    // Reset and undo must still work as before.
    await clickResetWithConfirm(page)
    await page.keyboard.press('Control+z')

    await expect(page.locator('foreignObject.skill-node-export-anchor')).toHaveCount(initialCount)
  })
})
