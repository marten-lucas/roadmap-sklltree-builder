import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_LABELS, STATUS_STYLES, normalizeStatusKey } from '../config'
import { BENEFIT_SIZE_LABELS, BENEFIT_SIZES, EFFORT_SIZE_LABELS, EFFORT_SIZES } from '../utils/effortBenefit'
import { getDisplayStatusKey, getLevelStatus } from '../utils/nodeStatus'

// ── Icons ─────────────────────────────────────────────────────────────────────

const EyeOffIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

const IconTree = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 3H3" /><path d="M9 3v18" /><path d="M9 9h12" /><path d="M9 15h8" />
  </svg>
)

const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const IconLayers = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
)

const IconBolt = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10" />
  </svg>
)

const IconStar = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
)

// ── helpers ───────────────────────────────────────────────────────────────────

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

const EFFORT_LABELS = { ...EFFORT_SIZE_LABELS }
const BENEFIT_LABELS = { ...BENEFIT_SIZE_LABELS }

// ── Metric slider ─────────────────────────────────────────────────────────────

const MetricSlider = ({ sizes, activeValue, onChange, kind, customPoints, onCustomChange, isSelected = false }) => {
  const labels = kind === 'value' ? BENEFIT_LABELS : EFFORT_LABELS
  const [draftValue, setDraftValue] = useState(activeValue)
  const [wheelArmed, setWheelArmed] = useState(false)
  const draftValueRef = useRef(activeValue)
  const lastNonCustomValueRef = useRef(activeValue === 'custom' ? 'unclear' : activeValue)
  const sliderRootRef = useRef(null)

  const getDisplayLabel = useCallback((value) => {
    if (value === 'unclear') return '?'
    if (value === 'custom') return 'C'
    return labels[value] ?? value
  }, [labels])

  useEffect(() => {
    setDraftValue(activeValue)
    draftValueRef.current = activeValue
    if (activeValue !== 'custom') lastNonCustomValueRef.current = activeValue
  }, [activeValue])

  useEffect(() => {
    if (!wheelArmed) return undefined

    const handleWindowPointerDown = (event) => {
      if (!sliderRootRef.current?.contains(event.target)) {
        setWheelArmed(false)
      }
    }

    const handleWindowKeyDown = (event) => {
      if (event.key === 'Escape') setWheelArmed(false)
    }

    window.addEventListener('pointerdown', handleWindowPointerDown, true)
    window.addEventListener('keydown', handleWindowKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown, true)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [wheelArmed])

  const commitDraft = useCallback((e) => {
    e?.stopPropagation?.()
    if (draftValueRef.current !== activeValue) onChange(draftValueRef.current)
  }, [activeValue, onChange])

  const handleWheel = useCallback((e) => {
    if (!wheelArmed) return
    e.preventDefault()
    e.stopPropagation()
    const currentIdx = Math.max(0, sizes.indexOf(draftValueRef.current))
    const deltaSign = e.deltaY > 0 ? 1 : -1
    const nextIdx = Math.max(0, Math.min(sizes.length - 1, currentIdx + deltaSign))
    const nextValue = sizes[nextIdx]
    draftValueRef.current = nextValue
    setDraftValue(nextValue)
    onChange(nextValue)
  }, [wheelArmed, sizes, onChange])

  const idx = Math.max(0, sizes.indexOf(draftValue))
  const showCustomInput = kind === 'effort' && draftValue === 'custom'
  const displayLabel = getDisplayLabel(draftValue)

  useEffect(() => {
    if (showCustomInput && wheelArmed) setWheelArmed(false)
  }, [showCustomInput, wheelArmed])

  return (
    <div
      ref={sliderRootRef}
      className={`list-view-drawer__metric-slider list-view-drawer__metric-slider--${kind}${isSelected ? ' list-view-drawer__metric-slider--selected' : ''}${wheelArmed ? ' list-view-drawer__metric-slider--wheel-armed' : ''}`}
      role="group"
      aria-label={kind}
      onWheel={handleWheel}
    >
      <span 
        className="list-view-drawer__slider-label"
        title="Click to activate wheel control"
        onClick={(e) => {
          e.stopPropagation()
          setWheelArmed(true)
        }}
      >
        {displayLabel}
      </span>
      {showCustomInput ? (
        <div className="list-view-drawer__metric-custom-editor">
          <label className="list-view-drawer__metric-custom-toggle" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={showCustomInput}
              aria-label="Custom effort"
              onChange={(e) => {
                e.stopPropagation()
                if (!e.currentTarget.checked) {
                  const restoreValue = lastNonCustomValueRef.current === 'custom' ? 'unclear' : lastNonCustomValueRef.current
                  draftValueRef.current = restoreValue
                  setDraftValue(restoreValue)
                  onChange(restoreValue)
                }
              }}
            />
            <span>Custom</span>
          </label>
          <input
            type="number"
            className="list-view-drawer__metric-custom-input"
            value={customPoints ?? ''}
            min={0}
            placeholder="pts"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation()
              onCustomChange?.(e.target.value === '' ? null : Number(e.target.value))
            }}
          />
        </div>
      ) : (
        <div className="list-view-drawer__slider-inner">
          <input
            type="range"
            min={0}
            max={sizes.length - 1}
            step={1}
            value={idx}
            className="list-view-drawer__slider-input"
            aria-valuetext={displayLabel}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onInput={(e) => {
              e.stopPropagation()
              const nextValue = sizes[Number(e.currentTarget.value)]
              if (nextValue !== 'custom') lastNonCustomValueRef.current = nextValue
              draftValueRef.current = nextValue
              setDraftValue(nextValue)
            }}
            onPointerUp={commitDraft}
            onKeyUp={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') commitDraft(e)
            }}
            onBlur={commitDraft}
          />
          <div
            className="list-view-drawer__slider-ticks"
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation()
              setWheelArmed(true)
            }}
          >
            {sizes.map((size, tickIdx) => (
              <span
                key={size}
                className={`list-view-drawer__slider-tick${tickIdx <= idx ? ' list-view-drawer__slider-tick--active' : ''}`}
                title={getDisplayLabel(size)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── LevelRow ──────────────────────────────────────────────────────────────────

const LevelRow = ({
  level,
  nodeId,
  selectedNodeId,
  selectedProgressLevelId,
  nodeLabel,
  depth,
  scopeMap,
  selectedReleaseId,
  onSelectLevel,
  showEstimateColumns,
  onSetEffort,
  onSetBenefit,
  listMode,
}) => {
  const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
  const isHidden = statusKey === 'hidden'
  const borderColor = getStatusBorderColor(statusKey)
  const scopeEntries = (level.scopeIds ?? []).map((id) => scopeMap.get(id)).filter(Boolean)
  const benefitValue = level.benefit?.size ?? 'unclear'
  const effortValue = level.effort?.size ?? 'unclear'
  const isSelected = selectedNodeId === nodeId && selectedProgressLevelId === level.id

  return (
    <li
      className="list-view-drawer__item list-view-drawer__item--level"
      style={{
        paddingLeft: listMode ? '0.5rem' : `${0.5 + depth * 1}rem`,
        opacity: isHidden ? 0.55 : undefined,
      }}
    >
      <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
        {!listMode && (
          <span className="list-view-drawer__toggle list-view-drawer__toggle--leaf" aria-hidden="true" />
        )}
        <div
          className={`list-view-drawer__item-body list-view-drawer__item-body--level${isSelected ? ' list-view-drawer__item-body--selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={onSelectLevel}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectLevel() }}
        >
          <div className="list-view-drawer__item-mainline">
            <span className="list-view-drawer__item-label list-view-drawer__item-label--level">
              {isHidden && <EyeOffIcon />}
              {listMode && nodeLabel && (
                <span className="list-view-drawer__node-prefix">{nodeLabel}&nbsp;·&nbsp;</span>
              )}
              <span className="list-view-drawer__level-name">{level.label || 'Level'}</span>
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

        {showEstimateColumns && (
          <>
            <MetricSlider
              sizes={BENEFIT_SIZES}
              activeValue={benefitValue}
              kind="value"
              isSelected={isSelected}
              onChange={(size) => onSetBenefit({ size })}
            />
            <MetricSlider
              sizes={EFFORT_SIZES}
              activeValue={effortValue}
              kind="effort"
              isSelected={isSelected}
              customPoints={level.effort?.customPoints ?? null}
              onCustomChange={(pts) => onSetEffort({ size: 'custom', customPoints: pts })}
              onChange={(size) => onSetEffort({ size, customPoints: size === 'custom' ? (level.effort?.customPoints ?? null) : null })}
            />
          </>
        )}
      </div>
    </li>
  )
}

// ── TreeNode ──────────────────────────────────────────────────────────────────

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
  selectedNodeId,
  selectedProgressLevelId,
}) => {
  const hasChildren = (node.children ?? []).length > 0
  const levels = node.levels ?? []
  const filteredLevels = showLevels ? levels.filter(matchesLevelFilters) : []
  const hasLevels = showLevels && filteredLevels.length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
  const hasExpandable = hasChildren || hasLevels
  const isExpanded = !isCollapsed
  const isNodeSelected = selectedNodeId === node.id && !selectedProgressLevelId
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
            className={`list-view-drawer__toggle${hasExpandable ? '' : ' list-view-drawer__toggle--leaf'}`}
            onClick={(e) => { e.stopPropagation(); if (hasExpandable) onToggle(node.id) }}
            aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            tabIndex={hasExpandable ? 0 : -1}
            aria-hidden={!hasExpandable}
          >
            {hasExpandable ? (isCollapsed ? '▶' : '▼') : ''}
          </button>
          <div
            className={`list-view-drawer__item-body${isNodeSelected ? ' list-view-drawer__item-body--selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectNode(node.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id) }}
          >
            <div className="list-view-drawer__item-mainline">
              <span className="list-view-drawer__item-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {isNodeFullyHidden && <EyeOffIcon />}
                {node.label || node.shortName || '\u2013'}
                {isNodeFullyHidden && <span style={{ fontSize: '0.7em', color: '#6b7280', marginLeft: 2 }}>(hidden)</span>}
              </span>
              {scopeEntries.length > 0 && !showLevels && (
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

      {isExpanded && hasLevels && filteredLevels.map((level) => (
        <LevelRow
          key={level.id}
          level={level}
          nodeId={node.id}
          selectedNodeId={selectedNodeId}
          selectedProgressLevelId={selectedProgressLevelId}
          depth={depth + 2}
          scopeMap={scopeMap}
          selectedReleaseId={selectedReleaseId}
          onSelectLevel={() => onSelectLevel(node.id, level.id)}
          showEstimateColumns={showEstimateColumns}
          onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
          onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
          listMode={false}
        />
      ))}

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
          selectedNodeId={selectedNodeId}
          selectedProgressLevelId={selectedProgressLevelId}
        />
      ))}
    </>
  )
}

// ── flat collection helpers ───────────────────────────────────────────────────

const collectFlatLevels = (nodes, matchesLevelFilters) => {
  const result = []
  const walk = (nodeList) => {
    for (const node of nodeList) {
      for (const level of (node.levels ?? []).filter(matchesLevelFilters)) {
        result.push({ node, level })
      }
      walk(node.children ?? [])
    }
  }
  walk(nodes)
  return result
}

const collectFlatNodes = (nodes, matchesNodeFilters) => {
  const result = []
  const walk = (nodeList) => {
    for (const node of nodeList) {
      if (matchesNodeFilters(node)) result.push(node)
      walk(node.children ?? [])
    }
  }
  walk(nodes)
  return result
}

// ── main component ────────────────────────────────────────────────────────────

export function ListViewDrawer({
  opened,
  onClose,
  document,
  onSelectNode,
  onSelectLevel,
  onSetLevelEffort = () => {},
  onSetLevelBenefit = () => {},
  selectedReleaseId = null,
  selectedNodeId = null,
  selectedProgressLevelId = null,
}) {
  const drawerRef = useRef(null)

  // ── state (all declared before any callback that might reference them) ──────
  const [drawerWidth, setDrawerWidth] = useState(null) // null = use CSS default
  const [collapsedIds, setCollapsedIds] = useState(new Set())
  const [showLevels, setShowLevels] = useState(true)
  const [showEstimateColumns, setShowEstimateColumns] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [scopeFilter, setScopeFilter] = useState('all')
  const [viewMode, setViewMode] = useState('tree') // 'tree' | 'list'

  const handleResizePointerDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const minWidth = showEstimateColumns ? 640 : 280
    // Use live DOM width; fall back to 420 if element not yet measured
    const startWidth = drawerRef.current?.getBoundingClientRect().width ?? 420
    const onMove = (mv) => {
      const newWidth = Math.max(minWidth, Math.min(1400, startWidth + (mv.clientX - startX)))
      setDrawerWidth(newWidth)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [showEstimateColumns])

  useEffect(() => {
    if (!showLevels && showEstimateColumns) setShowEstimateColumns(false)
  }, [showEstimateColumns, showLevels])

  useEffect(() => {
    if (showEstimateColumns && drawerWidth !== null && drawerWidth < 640) {
      setDrawerWidth(640)
    }
  }, [showEstimateColumns, drawerWidth])

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
    if (scopeFilter === 'all') return true
    return scopeIds.includes(scopeFilter)
  }, [scopeFilter])

  const matchesLevelFilters = useCallback((level) => {
    const statusKey = normalizeStatusKey(getLevelStatus(level, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) return false
    return matchesScopeFilter(level.scopeIds ?? [])
  }, [matchesScopeFilter, selectedReleaseId, statusFilter])

  const matchesNodeFilters = useCallback((node) => {
    const levels = node.levels ?? []
    if (levels.length > 0) return levels.some(matchesLevelFilters)
    const statusKey = normalizeStatusKey(getDisplayStatusKey(node, selectedReleaseId))
    if (statusFilter !== 'all' && statusKey !== statusFilter) return false
    return matchesScopeFilter([...getNodeScopeIds(node)])
  }, [matchesLevelFilters, matchesScopeFilter, selectedReleaseId, statusFilter])

  const filteredRootNodes = useMemo(() => {
    const filterTree = (nodes) => {
      const next = []
      for (const node of nodes) {
        const filteredChildren = filterTree(node.children ?? [])
        const includeSelf = matchesNodeFilters(node)
        if (includeSelf || filteredChildren.length > 0) {
          next.push({ ...node, children: filteredChildren })
        }
      }
      return next
    }
    return filterTree(allRootNodes)
  }, [allRootNodes, matchesNodeFilters])

  const flatLevelEntries = useMemo(
    () => (viewMode === 'list' && showLevels ? collectFlatLevels(allRootNodes, matchesLevelFilters) : []),
    [viewMode, showLevels, allRootNodes, matchesLevelFilters],
  )

  const flatNodes = useMemo(
    () => (viewMode === 'list' && !showLevels ? collectFlatNodes(allRootNodes, matchesNodeFilters) : []),
    [viewMode, showLevels, allRootNodes, matchesNodeFilters],
  )

  if (!opened) return null

  const isEmpty = allRootNodes.length === 0
  const isListMode = viewMode === 'list'
  const isFilteredEmpty = !isEmpty && (
    isListMode
      ? (showLevels ? flatLevelEntries.length === 0 : flatNodes.length === 0)
      : filteredRootNodes.length === 0
  )
  const drawerStyle = drawerWidth !== null ? { width: `${drawerWidth}px` } : undefined

  return (
    <div
      ref={drawerRef}
      className={`list-view-drawer${showEstimateColumns && drawerWidth === null ? ' list-view-drawer--wide' : ''}`}
      style={drawerStyle}
    >
      <div
        className="list-view-drawer__resize-handle"
        role="separator"
        aria-label="Resize list view"
        onPointerDown={handleResizePointerDown}
      />
      <div className="list-view-drawer__header">
        <div className="list-view-drawer__header-top">
          <span className="list-view-drawer__title">Node List</span>
          <button className="list-view-drawer__close" onClick={onClose} aria-label="Close list view">x</button>
        </div>

        <div className="list-view-drawer__header-controls">
          {/* Tree / List mode */}
          <div className="list-view-drawer__toggle-group" role="group" aria-label="View mode">
            <button
              type="button"
              className={`list-view-drawer__icon-toggle${viewMode === 'tree' ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => setViewMode('tree')}
              aria-label="Tree view"
              title="Tree view"
            >
              <IconTree />
            </button>
            <button
              type="button"
              className={`list-view-drawer__icon-toggle${viewMode === 'list' ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
              title="List view"
            >
              <IconList />
            </button>
          </div>

          {/* Levels icon toggle */}
          <button
            type="button"
            className={`list-view-drawer__icon-toggle${showLevels ? ' list-view-drawer__icon-toggle--active' : ''}`}
            onClick={() => setShowLevels((v) => !v)}
            aria-label={showLevels ? 'Hide levels' : 'Show levels'}
            title="Levels"
          >
            <IconLayers />
          </button>

          {/* Effort/Value icon toggle */}
          {showLevels && (
            <button
              type="button"
              className={`list-view-drawer__icon-toggle list-view-drawer__icon-toggle--dual${showEstimateColumns ? ' list-view-drawer__icon-toggle--active' : ''}`}
              onClick={() => setShowEstimateColumns((v) => !v)}
              aria-label={showEstimateColumns ? 'Hide effort/value' : 'Show effort/value'}
              title="Effort / Value"
            >
              <IconBolt /><IconStar />
            </button>
          )}

          <span className="list-view-drawer__header-sep" aria-hidden="true" />

          <select
            className="list-view-drawer__filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
            onChange={(e) => setScopeFilter(e.target.value)}
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
        {showEstimateColumns && showLevels && (
          <div className="list-view-drawer__metrics-header" aria-hidden="true">
            <span className="list-view-drawer__metrics-header-spacer" />
            <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--value">Value</span>
            <span className="list-view-drawer__metrics-header-col list-view-drawer__metrics-header-col--effort">Effort</span>
          </div>
        )}

        {isEmpty ? (
          <div className="list-view-drawer__empty">No nodes yet.</div>
        ) : isFilteredEmpty ? (
          <div className="list-view-drawer__empty">No nodes match the selected filters.</div>
        ) : isListMode && showLevels ? (
          /* flat level list */
          <ul className="list-view-drawer__list">
            {flatLevelEntries.map(({ node, level }) => (
              <LevelRow
                key={`${node.id}::${level.id}`}
                level={level}
                nodeId={node.id}
                selectedNodeId={selectedNodeId}
                selectedProgressLevelId={selectedProgressLevelId}
                nodeLabel={node.label || node.shortName}
                depth={0}
                scopeMap={scopeMap}
                selectedReleaseId={selectedReleaseId}
                onSelectLevel={() => onSelectLevel(node.id, level.id)}
                showEstimateColumns={showEstimateColumns}
                onSetEffort={(effort) => onSetLevelEffort(node.id, level.id, effort)}
                onSetBenefit={(benefit) => onSetLevelBenefit(node.id, level.id, benefit)}
                listMode
              />
            ))}
          </ul>
        ) : isListMode ? (
          /* flat node list */
          <ul className="list-view-drawer__list">
            {flatNodes.map((node) => {
              const borderColor = getStatusBorderColor(getDisplayStatusKey(node, selectedReleaseId))
              const scopeIds = getNodeScopeIds(node)
              const scopeEntries = [...scopeIds].map((id) => scopeMap.get(id)).filter(Boolean)
              return (
                <li key={node.id} className="list-view-drawer__item" style={{ paddingLeft: '0.5rem' }}>
                  <div className="list-view-drawer__item-row" style={{ borderRight: `3px solid ${borderColor}` }}>
                    <div
                      className={`list-view-drawer__item-body${selectedNodeId === node.id && !selectedProgressLevelId ? ' list-view-drawer__item-body--selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectNode(node.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectNode(node.id) }}
                    >
                      <div className="list-view-drawer__item-mainline">
                        <span className="list-view-drawer__item-label">{node.label || node.shortName || '\u2013'}</span>
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
              )
            })}
          </ul>
        ) : (
          /* tree view */
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
                selectedNodeId={selectedNodeId}
                selectedProgressLevelId={selectedProgressLevelId}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
