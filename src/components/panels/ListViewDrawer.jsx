import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { BENEFIT_SIZE_LABELS, EFFORT_SIZE_LABELS } from '../utils/effortBenefit'
import { getDisplayStatusKey, getLevelStatus } from '../utils/nodeStatus'

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

const LevelRow = ({
  level,
  depth,
  scopeMap,
  selectedReleaseId,
  onSelectLevel,
  showEstimateColumns,
  onSetEffort,
  onSetBenefit,
}) => {
  const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
  const isHidden = statusKey === 'hidden'
  const borderColor = getStatusBorderColor(statusKey)
  const scopeEntries = (level.scopeIds ?? []).map((id) => scopeMap.get(id)).filter(Boolean)
  const effortValue = level.effort?.size ?? 'unclear'
  const benefitValue = level.benefit?.size ?? 'unclear'

  return (
    <li
      className={`list-view-drawer__item list-view-drawer__item--level ${showEstimateColumns ? 'list-view-drawer__item--with-metrics' : ''}`}
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
          <div className="list-view-drawer__item-mainline">
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

          {showEstimateColumns && (
            <div className="list-view-drawer__metrics">
              <div className="list-view-drawer__metric-column">
                <span className="list-view-drawer__metric-label">Effort</span>
                <SizeButtonGroup
                  options={EFFORT_OPTIONS}
                  activeValue={effortValue}
                  kind="effort"
                  onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null })}
                />
              </div>
              <div className="list-view-drawer__metric-column">
                <span className="list-view-drawer__metric-label">Value</span>
                <SizeButtonGroup
                  options={BENEFIT_OPTIONS}
                  activeValue={benefitValue}
                  kind="value"
                  onChange={(size) => onSetBenefit({ size })}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

const EFFORT_OPTIONS = Object.entries(EFFORT_SIZE_LABELS)
const BENEFIT_OPTIONS = Object.entries(BENEFIT_SIZE_LABELS)

const SizeButtonGroup = ({ options, activeValue, onChange, kind }) => (
  <div className="list-view-drawer__metric-buttons" role="group" aria-label={`${kind} selector`}>
    {options.map(([value, label]) => (
      <button
        key={value}
        type="button"
        className={`list-view-drawer__metric-btn ${activeValue === value ? 'list-view-drawer__metric-btn--active' : ''}`}
        onClick={(event) => {
          event.stopPropagation()
          onChange(value)
        }}
        aria-pressed={activeValue === value}
      >
        {label}
      </button>
    ))}
  </div>
)

const TreeNode = ({
  node,
  depth,
  scopeMap,
  collapsedIds,
  onToggle,
  onSelectNode,
  onSelectLevel,
  showLevels,
  showEstimateColumns,
  selectedReleaseId,
  matchesLevelFilters,
  onSetLevelEffort,
  onSetLevelBenefit,
}) => {
  const hasChildren = (node.children ?? []).length > 0
  const levels = node.levels ?? []
  const filteredLevels = showLevels ? levels.filter(matchesLevelFilters) : []
  const hasLevels = showLevels && filteredLevels.length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
  const hasExpandable = hasChildren || hasLevels
  const isExpanded = !isCollapsed
  const isNodeFullyHidden = levels.length > 0
    ? levels.every((l) => normalizeStatusKey(getLevelStatus(l, selectedReleaseId)) === 'hidden')
    : normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId)) === 'hidden'

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
            <div className="list-view-drawer__item-mainline">
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
        </div>
      </li>

      {isExpanded && hasLevels && (
        <>
          {filteredLevels.map((level) => (
            <LevelRow
              key={level.id}
              level={level}
              depth={depth + 2}
              scopeMap={scopeMap}
              selectedReleaseId={selectedReleaseId}
              onSelectLevel={() => onSelectLevel(node.id, level.id)}
              showEstimateColumns={showEstimateColumns}
              onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
              onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
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
          showEstimateColumns={showEstimateColumns}
          selectedReleaseId={selectedReleaseId}
          matchesLevelFilters={matchesLevelFilters}
          onSetLevelEffort={onSetLevelEffort}
          onSetLevelBenefit={onSetLevelBenefit}
        />
      ))}
    </>
  )
}

export function ListViewDrawer({
  opened,
  onClose,
  document,
  onSelectNode,
  onSelectLevel,
  onSetLevelEffort = () => {},
  onSetLevelBenefit = () => {},
  selectedReleaseId = null,
}) {
  const drawerRef = useRef(null)

  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(true)
  const [showEstimateColumns, setShowEstimateColumns] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('all')

  useEffect(() => {
    if (!showLevels && showEstimateColumns) {
      setShowEstimateColumns(false)
    }
  }, [showEstimateColumns, showLevels])

  const handleToggle = useCallback((nodeId) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) next.delete(nodeId)
      else next.add(nodeId)
      return next
    })
  }, [])

  const allRootNodes = document?.children ?? []
  const scopeMap = new Map((document?.scopes ?? []).map((s) => [s.id, s]))
  const scopeFilterOptions = document?.scopes ?? []

  const matchesScopeFilter = useCallback((scopeIds = []) => {
    if (scopeFilter === 'all') {
      return true
    }

    return scopeIds.includes(scopeFilter)
  }, [scopeFilter])

  const matchesLevelFilters = useCallback((level) => {
    const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) {
      return false
    }

    return matchesScopeFilter(level.scopeIds ?? [])
  }, [matchesScopeFilter, selectedReleaseId, statusFilter])

  const matchesNodeFilters = useCallback((node) => {
    const levels = node.levels ?? []
    if (levels.length > 0) {
      return levels.some(matchesLevelFilters)
    }

    const statusKey = normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) {
      return false
    }

    return matchesScopeFilter([...getNodeScopeIds(node)])
  }, [matchesLevelFilters, matchesScopeFilter, selectedReleaseId, statusFilter])

  const filteredRootNodes = useMemo(() => {
    const filterTree = (nodes) => {
      const next = []

      for (const node of nodes) {
        const filteredChildren = filterTree(node.children ?? [])
        const includeSelf = matchesNodeFilters(node)

        if (includeSelf || filteredChildren.length > 0) {
          next.push({
            ...node,
            children: filteredChildren,
          })
        }
      }

      return next
    }

    return filterTree(allRootNodes)
  }, [allRootNodes, matchesNodeFilters])

  if (!opened) return null

  return (
    <div
      ref={drawerRef}
      className={`list-view-drawer ${showEstimateColumns ? 'list-view-drawer--wide' : ''}`}
    >
      <div className="list-view-drawer__header">
        <div className="list-view-drawer__header-top">
          <span className="list-view-drawer__title">Node List</span>
          <button
            className="list-view-drawer__close"
            onClick={onClose}
            aria-label="Close list view"
          >
            ×
          </button>
        </div>

        <div className="list-view-drawer__header-controls">
          <label className="list-view-drawer__levels-toggle">
            <input
              type="checkbox"
              checked={showLevels}
              onChange={(e) => setShowLevels(e.target.checked)}
            />
            Levels
          </label>

          {showLevels && (
            <label className="list-view-drawer__levels-toggle list-view-drawer__levels-toggle--metrics">
              <input
                type="checkbox"
                checked={showEstimateColumns}
                onChange={(e) => setShowEstimateColumns(e.target.checked)}
              />
              Effort/Value
            </label>
          )}

          <select
            className="list-view-drawer__filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            className="list-view-drawer__filter-select"
            value={scopeFilter}
            onChange={(event) => setScopeFilter(event.target.value)}
            aria-label="Filter by scope"
          >
            <option value="all">All Scopes</option>
            {scopeFilterOptions.map((scope) => (
              <option key={scope.id} value={scope.id}>{scope.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="list-view-drawer__content">
        {allRootNodes.length === 0 ? (
          <div className="list-view-drawer__empty">No nodes yet.</div>
        ) : filteredRootNodes.length === 0 ? (
          <div className="list-view-drawer__empty">No nodes match the selected filters.</div>
        ) : (
          <ul className="list-view-drawer__list">
            {filteredRootNodes.map((node) => (
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
                showEstimateColumns={showEstimateColumns}
                selectedReleaseId={selectedReleaseId}
                matchesLevelFilters={matchesLevelFilters}
                onSetLevelEffort={onSetLevelEffort}
                onSetLevelBenefit={onSetLevelBenefit}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
