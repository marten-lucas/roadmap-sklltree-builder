// Shared legend rendering for both Builder and HTML Export
// Usage: import { renderLegendMarkup, LEGEND_STATUS_ORDER, LEGEND_PORTAL_SOCKET_PATH, LEGEND_PORTAL_PLUG_PATH } from './LegendShared'

import { STATUS_LABELS, STATUS_STYLES, DEFAULT_STATUS_DESCRIPTIONS } from '../config'

export const LEGEND_STATUS_ORDER = ['done', 'now', 'next', 'later', 'someday']
export const LEGEND_PORTAL_SOCKET_PATH = 'M 0 -9 A 9 9 0 0 1 0 9'
export const LEGEND_PORTAL_PLUG_PATH = 'M -14 -7 L 7 -7 L 14 0 L 7 7 L -14 7 Z'

export function renderLegendMarkup({
  legendStatusDescriptions = DEFAULT_STATUS_DESCRIPTIONS,
  showPortals = true,
  className = '',
  statusStyles = STATUS_STYLES,
} = {}) {
  return `
    <div class="skill-tree-legend ${className}" aria-label="Status legend">
      <div class="skill-tree-legend__header">
        <div class="skill-tree-legend__title">Legend</div>
      </div>
      <div class="skill-tree-legend__section">
        <div class="skill-tree-legend__symbol-grid">
          ${LEGEND_STATUS_ORDER.map((statusKey) => {
            const style = statusStyles[statusKey] ?? statusStyles.later ?? STATUS_STYLES.later
            return `
              <div class="skill-tree-legend__symbol-item skill-tree-legend__symbol-item--status" title="${STATUS_LABELS[statusKey]}">
                <span class="skill-tree-legend__node-preview" aria-hidden="true">
                  <span class="skill-tree-legend__node-ring" style="background:${style.ringBand}"></span>
                  <span class="skill-tree-legend__node-core"></span>
                </span>
                <span class="skill-tree-legend__symbol-labels">
                  <strong class="skill-tree-legend__symbol-title">${STATUS_LABELS[statusKey]}</strong>
                  <span class="skill-tree-legend__symbol-copy">${legendStatusDescriptions[statusKey]}</span>
                </span>
              </div>
            `
          }).join('')}
          ${showPortals ? `
            <div class="skill-tree-legend__symbol-item skill-tree-legend__symbol-item--portal" title="Incoming portal">
              <span class="skill-tree-legend__portal-symbol" aria-hidden="true">
                <svg viewBox="-12 -12 24 24" class="skill-tree-legend__portal-svg">
                  <path class="skill-tree-portal__ring skill-tree-portal__ring--source" d="${LEGEND_PORTAL_SOCKET_PATH}" transform="rotate(180)" />
                </svg>
              </span>
              <span class="skill-tree-legend__symbol-labels">
                <strong class="skill-tree-legend__symbol-title">Incoming portal</strong>
                <span class="skill-tree-legend__symbol-copy">Shows upstream dependencies.</span>
              </span>
            </div>
            <div class="skill-tree-legend__symbol-item skill-tree-legend__symbol-item--portal" title="Outgoing portal">
              <span class="skill-tree-legend__portal-symbol" aria-hidden="true">
                <svg viewBox="-16 -10 32 20" class="skill-tree-legend__portal-svg">
                  <path class="skill-tree-portal__ring skill-tree-portal__ring--target" d="${LEGEND_PORTAL_PLUG_PATH}" />
                </svg>
              </span>
              <span class="skill-tree-legend__symbol-labels">
                <strong class="skill-tree-legend__symbol-title">Outgoing portal</strong>
                <span class="skill-tree-legend__symbol-copy">Shows downstream dependencies.</span>
              </span>
            </div>
          ` : ''}
        </div>
      </div>
      <div class="skill-tree-legend__tip skill-tree-legend__tip--footer">
        <span class="skill-tree-legend__tip-icon" aria-hidden="true">ⓘ</span>
        <span class="skill-tree-legend__tip-text">Tip: Zoom or hover for details.</span>
      </div>
    </div>
  `
}
