import { test, expect } from '@playwright/test'
import { startFresh } from './helpers.js'

const readCanvasScale = async (page) => page.evaluate(() => {
  const selectors = [
    '.react-transform-component',
    '.react-transform-element',
    '.skill-tree-transform-content',
  ]

  const scales = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .map((element) => window.getComputedStyle(element).transform)
    .filter((transform) => transform && transform !== 'none')
    .map((transform) => {
      const matrix = new DOMMatrixReadOnly(transform)
      return Math.abs(matrix.a)
    })

  if (scales.length === 0) return 1
  return Number(Math.max(...scales).toFixed(3))
})

test.describe('ListView effort/value refinements', () => {
  test.use({ viewport: { width: 1600, height: 900 } })

  test('loads seeded dataset, uses list mode effort/value, supports wheel, and selects without inspector', async ({ page }) => {
    await startFresh(page)

    await page.getByRole('button', { name: 'List View', exact: true }).click()
    await expect(page.locator('.list-view-drawer')).toBeVisible({ timeout: 10_000 })

    const treeModeButton = page.locator('.list-view-drawer button[title="Tree view"]')
    const listModeButton = page.locator('.list-view-drawer button[title="List view"]')

    await expect(treeModeButton).toBeVisible()
    await expect(listModeButton).toBeVisible()

    const listAlreadyActive = await listModeButton.evaluate((element) => element.classList.contains('list-view-drawer__icon-toggle--active'))
    if (!listAlreadyActive) {
      await listModeButton.click({ force: true })
    }

    await expect(listModeButton).toHaveClass(/list-view-drawer__icon-toggle--active/)
    await expect(treeModeButton).not.toHaveClass(/list-view-drawer__icon-toggle--active/)

    const columnsButton = page.locator('.list-view-drawer button[title="Columns"]')
    await expect(columnsButton).toBeVisible()
    await columnsButton.click()

    const columnsMenu = page.locator('.list-view-drawer__columns-menu')
    await expect(columnsMenu).toBeVisible()

    const effortValueToggle = columnsMenu.getByLabel('Effort / Value')
    const statusColumnToggle = columnsMenu.getByLabel('Status')
    const scopeColumnToggle = columnsMenu.getByLabel('Scopes')
    const releaseNotesToggle = columnsMenu.getByLabel('Release Notes')

    await expect(effortValueToggle).not.toBeChecked()
    await expect(statusColumnToggle).toBeChecked()
    await expect(scopeColumnToggle).toBeChecked()
    await expect(releaseNotesToggle).not.toBeChecked()

    await effortValueToggle.check({ force: true })

    const firstStatusGroup = page.locator('.list-view-drawer__status-group').first()
    await expect(firstStatusGroup).toBeVisible()

    const firstScopeGroup = page.locator('.list-view-drawer__scope-group').first()
    await expect(firstScopeGroup).toBeVisible()

    await releaseNotesToggle.check({ force: true })
    const firstReleaseNoteInput = page.locator('.list-view-drawer__release-note-input').first()
    await expect(firstReleaseNoteInput).toBeVisible()
    await firstReleaseNoteInput.fill('List panel note update')
    await firstReleaseNoteInput.blur()

    await releaseNotesToggle.click()
    await expect(page.locator('.list-view-drawer__release-note-input')).toHaveCount(0)
    await releaseNotesToggle.click()
    await expect(firstReleaseNoteInput).toHaveValue('List panel note update')

    await expect(firstScopeGroup.locator('input').first()).toBeVisible()

    await statusColumnToggle.click()
    await expect(page.locator('.list-view-drawer__status-group')).toHaveCount(0)
    await statusColumnToggle.click()
    await expect(firstStatusGroup).toBeVisible()

    await scopeColumnToggle.click()
    await expect(page.locator('.list-view-drawer__scope-group')).toHaveCount(0)
    await scopeColumnToggle.click()
    await expect(firstScopeGroup).toBeVisible()

    const firstDoneRadio = firstStatusGroup.locator('input[value="done"]')
    const firstSomedayRadio = firstStatusGroup.locator('input[value="someday"]')
    await expect(firstSomedayRadio).toBeVisible()
    await firstDoneRadio.check({ force: true })
    await expect(firstDoneRadio).toBeChecked()

    const firstEffortMetric = page.locator('.list-view-drawer__metric-slider--effort').first()
    await expect(firstEffortMetric).toBeVisible()

    const isSingleLineRow = await firstEffortMetric.evaluate((element) => {
      return window.getComputedStyle(element).flexDirection === 'row'
    })
    expect.soft(isSingleLineRow).toBe(true)

    const effortSlider = firstEffortMetric.locator('.list-view-drawer__slider-input')
    await expect(effortSlider).toBeVisible()

    const effortLabel = firstEffortMetric.locator('.list-view-drawer__slider-label')
    await effortSlider.fill('0')
    await expect(effortLabel).toHaveText('?')

    const readEffortWidths = async () => firstEffortMetric.evaluate((element) => {
      const slider = element.querySelector('.list-view-drawer__slider-input')
      return {
        sliderWidth: slider ? slider.getBoundingClientRect().width : 0,
      }
    })

    const widthAtUnclear = await readEffortWidths()
    expect.soft(widthAtUnclear.sliderWidth).toBeGreaterThan(80)

    const beforeWheelValue = Number(await effortSlider.inputValue())
    await firstEffortMetric.locator('.list-view-drawer__slider-label').click()
    await page.mouse.wheel(0, 150)

    await expect
      .poll(async () => Number(await effortSlider.inputValue()))
      .not.toBe(beforeWheelValue)

    await effortSlider.fill('2')
    const widthAtRegular = await readEffortWidths()
    expect.soft(Math.abs(widthAtUnclear.sliderWidth - widthAtRegular.sliderWidth)).toBeLessThan(1.5)

    await effortSlider.fill('6')
    const customInput = firstEffortMetric.locator('.list-view-drawer__metric-custom-input')
    await expect(customInput).toBeVisible()
    await expect(firstEffortMetric.locator('.list-view-drawer__slider-input')).toHaveCount(0)

    const customToggle = firstEffortMetric.locator('.list-view-drawer__metric-custom-toggle input[type="checkbox"]')
    await expect(customToggle).toBeVisible()
    await expect(customToggle).toBeChecked()

    const customEditorWidth = await firstEffortMetric.evaluate((element) => {
      const editor = element.querySelector('.list-view-drawer__metric-custom-editor')
      return editor ? editor.getBoundingClientRect().width : 0
    })
    expect.soft(customEditorWidth).toBeGreaterThan(80)

    await customToggle.click()
    const effortSliderAfterUncheck = firstEffortMetric.locator('.list-view-drawer__slider-input')
    await expect(effortSliderAfterUncheck).toBeVisible()

    const widthAfterUncheck = await firstEffortMetric.evaluate((element) => {
      const slider = element.querySelector('.list-view-drawer__slider-input')
      return slider ? slider.getBoundingClientRect().width : 0
    })
    expect.soft(Math.abs(widthAtRegular.sliderWidth - widthAfterUncheck)).toBeLessThan(1.5)

    const firstValueMetric = page.locator('.list-view-drawer__metric-slider--value').first()
    const valueSlider = firstValueMetric.locator('.list-view-drawer__slider-input')
    await expect(valueSlider).toBeVisible()
    await valueSlider.fill('0')
    const valueWidthAtUnclear = await firstValueMetric.evaluate((element) => {
      const slider = element.querySelector('.list-view-drawer__slider-input')
      return slider ? slider.getBoundingClientRect().width : 0
    })
    await valueSlider.fill('5')
    const valueWidthAtHigh = await firstValueMetric.evaluate((element) => {
      const slider = element.querySelector('.list-view-drawer__slider-input')
      return slider ? slider.getBoundingClientRect().width : 0
    })
    expect.soft(Math.abs(valueWidthAtUnclear - valueWidthAtHigh)).toBeLessThan(1.5)

    const inspectorToggle = page.locator('.list-view-drawer__inspector-toggle input[type="checkbox"]')
    await expect(inspectorToggle).toBeVisible()
    await expect(inspectorToggle).not.toBeChecked()

    await expect.soft(page.locator('.skill-panel--inspector')).toHaveCount(0)

    await page.locator('.list-view-drawer__item-body--level').first().click()

    await expect.soft(page.locator('.skill-panel--inspector')).toHaveCount(0)

    await inspectorToggle.check({ force: true })
    await expect(inspectorToggle).toBeChecked()

    await page.locator('.list-view-drawer__item-body--level').first().click()
    await expect(page.locator('.skill-panel--inspector')).toBeVisible()

    const secondLevelName = String(await page.locator('.list-view-drawer__level-name').nth(1).textContent() ?? '').trim()
    await page.locator('.list-view-drawer__item-body--level').nth(1).click()
    await expect(page.locator('.skill-panel--inspector [role="tab"][aria-selected="true"]').first()).toHaveAttribute('aria-label', secondLevelName)

    await expect
      .poll(async () => readCanvasScale(page))
      .toBeGreaterThan(3.95)

    const scale = await readCanvasScale(page)
    expect.soft(scale).toBeLessThan(4.05)
  })
})
