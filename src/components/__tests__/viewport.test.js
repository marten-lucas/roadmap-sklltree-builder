import { describe, expect, it } from 'vitest'
import {
  VIEWPORT_DEFAULTS,
  VIEWPORT_ZOOM_STEPS,
  clampScale,
  computeFitScale,
  computeFitTransform,
  getViewportKeyboardAction,
  getNextZoomStep,
  snapScaleToStep,
} from '../utils/viewport'

describe('viewport utils', () => {
  it('clamps scales to configured min/max', () => {
    expect(clampScale(-1)).toBe(VIEWPORT_DEFAULTS.minScale)
    expect(clampScale(11)).toBe(VIEWPORT_DEFAULTS.maxScale)
    expect(clampScale(1.25)).toBe(1.25)
  })

  it('snaps scale to nearest configured zoom step', () => {
    expect(snapScaleToStep(0.24)).toBe(0.25)
    expect(snapScaleToStep(1.1)).toBe(1)
    expect(snapScaleToStep(1.4)).toBe(1)
  })

  it('returns next and previous zoom step', () => {
    expect(getNextZoomStep(1, 1)).toBe(2)
    expect(getNextZoomStep(1, -1)).toBe(0.75)
    expect(getNextZoomStep(0.25, -1)).toBe(0.25)
    expect(getNextZoomStep(2, 1)).toBe(3)
    expect(getNextZoomStep(4, 1)).toBe(5)
  })

  it('computes fit scale with padding and limits', () => {
    const fit = computeFitScale({
      contentWidth: 1200,
      contentHeight: 800,
      viewportWidth: 1000,
      viewportHeight: 700,
      padding: 80,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })

    expect(fit).toBeGreaterThanOrEqual(VIEWPORT_DEFAULTS.minScale)
    expect(fit).toBeLessThanOrEqual(VIEWPORT_DEFAULTS.maxScale)
    expect(VIEWPORT_ZOOM_STEPS.includes(fit)).toBe(false)
  })

  it('computes fit transform from content bounds', () => {
    const result = computeFitTransform({
      contentBounds: { x: 100, y: 50, width: 200, height: 100 },
      viewportWidth: 500,
      viewportHeight: 400,
      padding: 50,
      minScale: VIEWPORT_DEFAULTS.minScale,
      maxScale: VIEWPORT_DEFAULTS.maxScale,
    })

    expect(result.scale).toBeCloseTo(1.6666667, 6)
    expect(result.positionX).toBeCloseTo(-83.3333333, 5)
    expect(result.positionY).toBeCloseTo(33.3333333, 5)
  })

  it('maps viewport keyboard actions for pan, zoom and fit', () => {
    expect(getViewportKeyboardAction({ key: 'ArrowLeft' })).toBeNull()
    expect(getViewportKeyboardAction({ key: 'ArrowLeft', shiftKey: true })).toBe('pan-left')
    expect(getViewportKeyboardAction({ key: 'ArrowRight', shiftKey: true })).toBe('pan-right')
    expect(getViewportKeyboardAction({ key: 'ArrowUp', shiftKey: true })).toBe('pan-up')
    expect(getViewportKeyboardAction({ key: 'ArrowDown', shiftKey: true })).toBe('pan-down')
    expect(getViewportKeyboardAction({ key: '+', ctrlKey: true })).toBe('zoom-in')
    expect(getViewportKeyboardAction({ key: '-', metaKey: true })).toBe('zoom-out')
    expect(getViewportKeyboardAction({ key: '0', ctrlKey: true })).toBe('fit')
    expect(getViewportKeyboardAction({ key: ' ', spaceKey: true })).toBe('pan-hold')
    expect(getViewportKeyboardAction({ key: '+', ctrlKey: true, isEditableTarget: true })).toBeNull()
  })
})
