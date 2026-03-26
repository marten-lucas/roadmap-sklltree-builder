export const VIEWPORT_ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

export const VIEWPORT_DEFAULTS = {
  minScale: 0.2,
  maxScale: 2.2,
  fitPadding: 72,
  wheelStep: 0.12,
}

export const clampScale = (
  value,
  minScale = VIEWPORT_DEFAULTS.minScale,
  maxScale = VIEWPORT_DEFAULTS.maxScale,
) => Math.max(minScale, Math.min(maxScale, value))

export const snapScaleToStep = (value, steps = VIEWPORT_ZOOM_STEPS) => {
  if (!Number.isFinite(value)) {
    return steps[0]
  }

  return steps.reduce((closest, step) => {
    if (Math.abs(step - value) < Math.abs(closest - value)) {
      return step
    }

    return closest
  }, steps[0])
}

const findStepIndex = (value, steps = VIEWPORT_ZOOM_STEPS) => {
  const snapped = snapScaleToStep(value, steps)
  const exactIndex = steps.findIndex((step) => step === snapped)
  return exactIndex >= 0 ? exactIndex : 0
}

export const getNextZoomStep = (
  currentScale,
  direction,
  steps = VIEWPORT_ZOOM_STEPS,
  minScale = VIEWPORT_DEFAULTS.minScale,
  maxScale = VIEWPORT_DEFAULTS.maxScale,
) => {
  const clampedCurrent = clampScale(currentScale, minScale, maxScale)
  const currentIndex = findStepIndex(clampedCurrent, steps)

  if (direction > 0) {
    return clampScale(steps[Math.min(steps.length - 1, currentIndex + 1)], minScale, maxScale)
  }

  if (direction < 0) {
    return clampScale(steps[Math.max(0, currentIndex - 1)], minScale, maxScale)
  }

  return clampScale(snapScaleToStep(clampedCurrent, steps), minScale, maxScale)
}

export const computeFitScale = ({
  contentWidth,
  contentHeight,
  viewportWidth,
  viewportHeight,
  padding = VIEWPORT_DEFAULTS.fitPadding,
  minScale = VIEWPORT_DEFAULTS.minScale,
  maxScale = VIEWPORT_DEFAULTS.maxScale,
}) => {
  const width = Math.max(1, Number(contentWidth) || 1)
  const height = Math.max(1, Number(contentHeight) || 1)
  const viewWidth = Math.max(1, Number(viewportWidth) || 1)
  const viewHeight = Math.max(1, Number(viewportHeight) || 1)

  const fittedScale = Math.min(viewWidth / (width + padding * 2), viewHeight / (height + padding * 2))
  return clampScale(fittedScale, minScale, maxScale)
}
