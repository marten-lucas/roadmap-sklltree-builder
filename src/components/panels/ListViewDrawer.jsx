import { useCallback, useRef, useState } from 'react'
import { STATUS_STYLES } from '../config'

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

const TreeNode = ({ node, depth, scopeMap, collapsedIds, onToggle, onSelectNode }) => {
  const hasChildren = (node.children ?? []).length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const borderColor = getStatusBorderColor(node.status)
  const scopeIds = getNodeScopeIds(node)
  const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)

  return (
    <>
      <li
        className="list-view-drawer__item"
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
      >
        <div className="list-view-drawer__item-row" style={{ borderLeft: `3px solid ${borderColor}` }}>
          <button
            className={`list-view-drawer__toggle ${hasChildren ? '' : 'list-view-drawer__toggle--leaf'}`}
            onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle(node.id) }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            tabIndex={hasChildren ? 0 : -1}
            aria-hidden={!hasChildren}
          >
            {hasChildren ? (isCollapsed ? '▶' : '▼') : ''}
          </button>
          <div
            className="list-view-drawer__item-body"
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id) }}
          >
            <span className="list-view-drawer__item-label">{node.label || node.shortName || '–'}</span>
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
      {hasChildren && !isCollapsed && (node.children ?? []).map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          scopeMap={scopeMap}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onSelectNode={onSelectNode}
        />
      ))}
    </>
  )
}

export function ListViewDrawer({ opened, onClose, document, onSelectNode }) {
  const drawerRef = useRef(null)
  const [drawerWidth, setDrawerWidth] = useState(null)
  const [collapsedIds, setCollapsedIds] = useState(new Set())

  const handleToggle = useCallback((nodeId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = drawerRef.current?.offsetWidth ?? window.innerWidth * 0.3
    const onMove = (moveEvt) => {
      const newWidth = Math.max(240, Math.min(window.innerWidth * 0.7, startWidth + (moveEvt.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  if (!opened) return null

  const rootNodes = document?.children ?? []
  const scopeMap = new Map((document?.scopes ?? []).map((s) => [s.id, s]))

  return (
    <div
      ref={drawerRef}
      className="list-view-drawer"
      style={{ width: drawerWidth != null ? `${drawerWidth}px` : '280px' }}
    >
      <div className="list-view-drawer__header">
        <span className="list-view-drawer__title">Node List</span>
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
              />
            ))}
          </ul>
        )}
      </div>

      {/* Resize handle on the right edge */}
      <div
        className="list-view-drawer__resize-handle"
        onMouseDown={handleResizeStart}
        aria-hidden="true"
      >
        <div className="list-view-drawer__resize-grip" />
      </div>
    </div>
  )
}
