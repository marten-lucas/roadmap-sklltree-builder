import { useCallback, useRef, useState } from 'react'
import { STATUS_STYLES, normalizeStatusKey } from '../config'

const EyeOffIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const ScopeChip = ({ label, color }) => (
  <span
    className="list-view-drawer__chip list-view-drawer__chip--scope"
    style={color ? { borderColor: color, color } : undefined}
  >
    {label}
  </span>
)

const getStatusBorderColor = (status) => {
  const key = status ?? 'later'
  return (STATUS_STYLES[key] ?? STATUS_STYLES.later).ringBand
}

const getNodeScopeIds = (node) => {
  const ids = new Set()
  for (const level of node.levels ?? []) {
    for (const id of level.scopeIds ?? []) ids.add(id)
  }
  return ids
}

const LevelRow = ({ level, depth, scopeMap, onSelectLevel }) => {
  const statusKey = normalizeStatusKey(level.status)
  const isHidden = statusKey === 'hidden'
  const borderColor = getStatusBorderColor(level.status)
  const scopeEntries = (level.scopeIds ?? []).map((id) => scopeMap.get(id)).filter(Boolean)
  return (
    <li
      className="list-view-drawer__item list-view-drawer__item--level"
      style={{ paddingLeft: `${0.5 + depth * 1}rem`, opacity: isHidden ? 0.55 : undefined }}
    >
      <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
        {/* indent spacer to align with node toggle */}
        <span className="list-view-drawer__toggle list-view-drawer__toggle--leaf" aria-hidden="true" />
        <div
          className="list-view-drawer__item-body list-view-drawer__item-body--level"
          role="button"
          tabIndex={0}
          onClick={onSelectLevel}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel() }}
        >
          <span className="list-view-drawer__item-label list-view-drawer__item-label--level" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isHidden && <EyeOffIcon />}
            {level.label || 'Level'}
            {isHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
          </span>
          {scopeEntries.length > 0 && (
            <span className="list-view-drawer__item-chips">
              {scopeEntries.map((scope) => (
                <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
              ))}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

const LEVELS_KEY = (id) => `__levels__${id}`

const TreeNode = ({ node, depth, scopeMap, collapsedIds, onToggle, onSelectNode, onSelectLevel, showLevels }) => {
  const hasChildren = (node.children ?? []).length > 0
  const levels = node.levels ?? []
  const hasLevels = showLevels && levels.length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const levelsCollapsed = collapsedIds.has(LEVELS_KEY(node.id))
  const borderColor = getStatusBorderColor(node.status)
  const hasExpandable = hasChildren || hasLevels
  const isExpanded = !isCollapsed
  const isNodeFullyHidden = levels.length > 0
    ? levels.every((l) => normalizeStatusKey(l.status) === 'hidden')
    : normalizeStatusKey(node.status) === 'hidden'

  const scopeIds = getNodeScopeIds(node)
  const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)

  return (
    <>
      <li
        className="list-view-drawer__item"
        style={{ paddingLeft: `${0.5 + depth * 1}rem`, opacity: isNodeFullyHidden ? 0.55 : undefined }}
      >
        <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
          <button
            className={`list-view-drawer__toggle ${hasExpandable ? '' : 'list-view-drawer__toggle--leaf'}`}
            onClick={(e) => { e.stopPropagation(); if (hasExpandable) onToggle(node.id) }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            tabIndex={hasExpandable ? 0 : -1}
            aria-hidden={!hasExpandable}
          >
            {hasExpandable ? (isCollapsed ? '▶' : '▼') : ''}
          </button>
          <div
            className="list-view-drawer__item-body"
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id) }}
          >
            <span className="list-view-drawer__item-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {isNodeFullyHidden && <EyeOffIcon />}
              {node.label || node.shortName || '–'}
              {isNodeFullyHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
            </span>
            {scopeEntries.length > 0 && (
              <span className="list-view-drawer__item-chips">
                {scopeEntries.map((scope) => (
                  <ScopeChip key={scope.id} label={scope.label} color={scope.color} />
                ))}
              </span>
            )}
          </div>
        </div>
      </li>

      {isExpanded && hasLevels && (
        <>
          <li
            className="list-view-drawer__item list-view-drawer__item--levels-header"
            style={{ paddingLeft: `${0.5 + (depth + 1) * 1}rem` }}
          >
            <div className="list-view-drawer__item-row">
              <button
                className="list-view-drawer__toggle"
                onClick={(e) => { e.stopPropagation(); onToggle(LEVELS_KEY(node.id)) }}
                aria-label={levelsCollapsed ? 'Show levels' : 'Hide levels'}
              >
                {levelsCollapsed ? '▶' : '▼'}
              </button>
              <span className="list-view-drawer__levels-label">Levels ({levels.length})</span>
            </div>
          </li>
          {!levelsCollapsed && levels.map((level) => (
            <LevelRow
              key={level.id}
              level={level}
              depth={depth + 2}
              scopeMap={scopeMap}
              onSelectLevel={() => onSelectLevel(node.id, level.id)}
            />
          ))}
        </>
      )}

      {isExpanded && hasChildren && (node.children ?? []).map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          scopeMap={scopeMap}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onSelectNode={onSelectNode}
          onSelectLevel={onSelectLevel}
          showLevels={showLevels}
        />
      ))}
    </>
  )
}

export function ListViewDrawer({ opened, onClose, document, onSelectNode, onSelectLevel }) {
  const drawerRef = useRef(null)

  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(true)

  const handleToggle = useCallback((nodeId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  if (!opened) return null

  const rootNodes = document?.children ?? []
  const scopeMap = new Map((document?.scopes ?? []).map((s) => [s.id, s]))

  return (
    <div
      ref={drawerRef}
      className="list-view-drawer"
    >
      <div className="list-view-drawer__header">
        <span className="list-view-drawer__title">Node List</span>
        <label className="list-view-drawer__levels-toggle">
          <input
            type="checkbox"
            checked={showLevels}
            onChange={(e) => setShowLevels(e.target.checked)}
          />
          Levels
        </label>
        <button
          className="list-view-drawer__close"
          onClick={onClose}
          aria-label="Close list view"
        >
          ×
        </button>
      </div>

      <div className="list-view-drawer__content">
        {rootNodes.length === 0 ? (
          <div className="list-view-drawer__empty">No nodes yet.</div>
        ) : (
          <ul className="list-view-drawer__list">
            {rootNodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                scopeMap={scopeMap}
                collapsedIds={collapsedIds}
                onToggle={handleToggle}
                onSelectNode={onSelectNode}
                onSelectLevel={onSelectLevel}
                showLevels={showLevels}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
