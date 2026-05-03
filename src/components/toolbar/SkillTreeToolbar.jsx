import { ActionIcon, Menu, Paper, Select, Slider, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChartDots,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFilter,
  IconFilters,
  IconInfoCircle,
  IconList,
  IconArrowsMinimize,
  IconNotes,
  IconPercentage20,
  IconRefresh,
  IconSearch,
  IconScreenShare,
  IconZoomIn,
  IconZoomOut,
  IconUpload,
  IconX,
} from '@tabler/icons-react'
import { STATUS_LABELS, STATUS_STYLES } from '../config'
import {
  STATUS_VISIBILITY_MODES,
  buildDefaultStatusFilterModeMap,
  hasActiveStatusFilterModes,
  normalizeStatusFilterModeMap,
} from '../utils/visibility'
import { VIEWPORT_ZOOM_STEPS } from '../utils/viewport'
import { Tooltip } from '../tooltip'

const TOOLBAR_ICON_PROPS = {
  size: 32,
  stroke: 1.5,
}

const TOOLBAR_TOOLTIP_MIDDLEWARES = {
  flip: true,
  shift: true,
  inline: false,
}

const STATUS_FILTER_ORDER = ['done', 'now', 'next', 'later', 'someday']

const SCOPE_FILTER_ALL = '__all__'

export function SkillTreeToolbar({
  isCollapsed,
  onToggleCollapsed,
  onOpenDocumentPicker,
  onOpenHtmlDocumentPicker,
  onOpenCsvDocumentPicker,
  onOpenJsonDocumentPicker,
  onExportHtml,
  onExportCsv,
  onExportJson,
  onExportPdf,
  onExportSvg,
  onExportPng,
  onExportCleanSvg,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onReset,
  onOpenSegmentManager,
  onOpenScopeManager,
  onOpenPriorityMatrix,
  onOpenListView,
  onOpenStatusSummary,
  onOpenReleaseNotes,
  releaseFilter,
  setReleaseFilter,
  selectedReleaseFilterLabel,
  selectedScopeFilterId,
  setSelectedScopeFilterId,
  selectedScopeFilterLabel,
  scopeOptions = [],
  autosaveLabel,
  allNodesById,
  onSelectNode,
  currentZoomScale = 1,
  onZoomIn,
  onZoomOut,
  onZoomToScale,
  onFitToScreen,
  hiddenNodeCount = 0,
  showHiddenNodes = false,
  onToggleShowHiddenNodes,
  releases = [],
  selectedReleaseId = null,
  onReleaseChange,
  isLegendVisible = false,
  onToggleLegend,
  isBudgetOverviewVisible = false,
  onToggleBudgetOverview,
  hasBudgetAlert = false,
  statusStyles = STATUS_STYLES,
}) {
  const [toolbarSearch, setToolbarSearch] = useState('')
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false)

  const selectedScopeFilterIds = useMemo(() => {
    if (Array.isArray(selectedScopeFilterId)) {
      return Array.from(new Set(selectedScopeFilterId.filter((scopeId) => typeof scopeId === 'string' && scopeId && scopeId !== SCOPE_FILTER_ALL && scopeId !== 'all')))
    }

    if (typeof selectedScopeFilterId === 'string' && selectedScopeFilterId && selectedScopeFilterId !== SCOPE_FILTER_ALL && selectedScopeFilterId !== 'all') {
      return [selectedScopeFilterId]
    }

    return []
  }, [selectedScopeFilterId])

  const statusFilterModeByKey = useMemo(() => {
    return normalizeStatusFilterModeMap(releaseFilter)
  }, [releaseFilter])

  const searchResults = useMemo(() => {
    const q = String(toolbarSearch ?? '').trim().toLowerCase()
    if (!q) return []

    const results = []
    for (const node of allNodesById.values()) {
      const label = String(node.label ?? '').toLowerCase()
      const short = String(node.shortName ?? '').toLowerCase()
      if (label.includes(q) || short.includes(q)) {
        results.push(node)
      }
      if (results.length >= 10) break
    }
    return results
  }, [allNodesById, toolbarSearch])

  const handleToggleScopeFilter = (scopeId) => {
    if (!setSelectedScopeFilterId || !scopeId) {
      return
    }

    if (selectedScopeFilterIds.includes(scopeId)) {
      const nextScopeFilterIds = selectedScopeFilterIds.filter((selectedId) => selectedId !== scopeId)
      setSelectedScopeFilterId(nextScopeFilterIds.length > 0 ? nextScopeFilterIds : SCOPE_FILTER_ALL)
      return
    }

    setSelectedScopeFilterId([...selectedScopeFilterIds, scopeId])
  }

  const handleSetStatusFilterMode = (statusKey, nextMode) => {
    if (!setReleaseFilter || !STATUS_FILTER_ORDER.includes(statusKey)) {
      return
    }

    if (statusFilterModeByKey[statusKey] === nextMode) {
      return
    }

    setReleaseFilter({
      ...statusFilterModeByKey,
      [statusKey]: nextMode,
    })
  }

  const handleSetAllStatusFilterModes = (nextMode) => {
    if (!setReleaseFilter) {
      return
    }

    setReleaseFilter(
      Object.fromEntries(STATUS_FILTER_ORDER.map((statusKey) => [statusKey, nextMode])),
    )
  }

  const handleResetStatusFilterModes = () => {
    if (!setReleaseFilter) {
      return
    }

    setReleaseFilter(buildDefaultStatusFilterModeMap())
  }

  const zoomPercentage = Math.round((currentZoomScale ?? 1) * 100)
  const zoomSliderValue = Math.round((currentZoomScale ?? 1) * 100)
  const zoomMarks = VIEWPORT_ZOOM_STEPS.map((step) => ({
    value: Math.round(step * 100),
    label: '',
  }))
  const hasActiveFilters = hasActiveStatusFilterModes(statusFilterModeByKey) || selectedScopeFilterIds.length > 0

  return (
    <Paper
      className={isCollapsed ? 'skill-tree-toolbar skill-tree-toolbar--collapsed' : 'skill-tree-toolbar'}
      radius="xl"
      shadow="xl"
      withBorder
    >
      <div className="skill-tree-toolbar__row">
        <Tooltip label={isCollapsed ? 'Expand menu' : 'Collapse menu'} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
          <ActionIcon
            size="md"
            variant="default"
            aria-label={isCollapsed ? 'Expand menu' : 'Collapse menu'}
            onClick={onToggleCollapsed}
          >
            {isCollapsed ? <IconChevronRight {...TOOLBAR_ICON_PROPS} /> : <IconChevronLeft {...TOOLBAR_ICON_PROPS} />}
          </ActionIcon>
        </Tooltip>

        <div className="skill-tree-toolbar__actions">
          <div className="skill-tree-toolbar__cluster">
            <Menu
              shadow="md"
              width={200}
              position="bottom-start"
              withArrow
              trigger="hover"
              openDelay={100}
              closeDelay={180}
            >
              <Menu.Target>
                <Tooltip label="Export (click: HTML, hover: more formats)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                  <ActionIcon
                    size="md"
                    variant="default"
                    aria-label="Export"
                    onClick={onExportHtml}
                  >
                    <IconUpload {...TOOLBAR_ICON_PROPS} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Export</Menu.Label>
                <Menu.Item onClick={onExportHtml}>
                  HTML
                </Menu.Item>
                <Menu.Item onClick={onExportCsv}>
                  CSV
                </Menu.Item>
                <Menu.Item onClick={onExportJson}>
                  JSON
                </Menu.Item>
                <Menu.Item onClick={onExportPdf}>
                  PDF
                </Menu.Item>
                <Menu.Item onClick={onExportSvg}>
                  SVG (interactive)
                </Menu.Item>
                <Menu.Item onClick={onExportPng}>
                  PNG
                </Menu.Item>
                <Menu.Item onClick={onExportCleanSvg}>
                  SVG (clean)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Menu
              shadow="md"
              width={180}
              position="bottom-start"
              withArrow
              trigger="hover"
              openDelay={100}
              closeDelay={180}
            >
              <Menu.Target>
                <Tooltip label="Importieren (Klick: alle Formate, Hover: gezielt wählen)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                  <ActionIcon
                    size="md"
                    variant="default"
                    aria-label="HTML importieren"
                    onClick={onOpenDocumentPicker}
                  >
                    <IconDownload {...TOOLBAR_ICON_PROPS} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Import</Menu.Label>
                <Menu.Item onClick={onOpenHtmlDocumentPicker ?? onOpenDocumentPicker}>
                  HTML
                </Menu.Item>
                <Menu.Item onClick={onOpenCsvDocumentPicker}>
                  CSV
                </Menu.Item>
                <Menu.Item onClick={onOpenJsonDocumentPicker}>
                  JSON
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label={isZoomMenuOpen ? 'Hide zoom menu' : 'Show zoom menu'} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label={isZoomMenuOpen ? 'Hide zoom menu' : 'Show zoom menu'}
                onClick={() => setIsZoomMenuOpen((open) => !open)}
              >
                {isZoomMenuOpen ? <IconX {...TOOLBAR_ICON_PROPS} /> : <IconSearch {...TOOLBAR_ICON_PROPS} />}
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Fit to screen" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Fit to screen"
                onClick={onFitToScreen}
              >
                <IconScreenShare {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <div className={isZoomMenuOpen ? 'skill-tree-toolbar__zoom-menu skill-tree-toolbar__zoom-menu--open' : 'skill-tree-toolbar__zoom-menu'}>
              <Tooltip label="Zoom out" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Zoom out"
                  onClick={onZoomOut}
                >
                  <IconZoomOut {...TOOLBAR_ICON_PROPS} />
                </ActionIcon>
              </Tooltip>

              <div className="skill-tree-toolbar__zoom-slider">
                <Slider
                  aria-label="Zoom"
                  min={Math.round(VIEWPORT_ZOOM_STEPS[0] * 100)}
                  max={Math.round(VIEWPORT_ZOOM_STEPS[VIEWPORT_ZOOM_STEPS.length - 1] * 100)}
                  step={1}
                  value={zoomSliderValue}
                  marks={zoomMarks}
                  label={(value) => `${value}%`}
                  onChange={(value) => onZoomToScale?.(value / 100)}
                />
              </div>

              <Text className="skill-tree-toolbar__zoom-value">{zoomPercentage}%</Text>

              <Tooltip label="Zoom in" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                <ActionIcon
                  size="md"
                  variant="default"
                  aria-label="Zoom in"
                  onClick={onZoomIn}
                >
                  <IconZoomIn {...TOOLBAR_ICON_PROPS} />
                </ActionIcon>
              </Tooltip>

            </div>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Undo (Ctrl+Z)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Undo"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <IconArrowBackUp {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Redo (Ctrl+Y / Ctrl+Shift+Z)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Redo"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <IconArrowForwardUp {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Reset (Ctrl+Shift+Backspace)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="subtle"
                color="red"
                aria-label="Reset"
                onClick={onReset}
              >
                <IconRefresh {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Manage segments" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Manage segments"
                onClick={onOpenSegmentManager}
              >
                <IconPercentage20 {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Manage scopes" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Manage scopes"
                onClick={onOpenScopeManager}
              >
                <IconFilters {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Priority Matrix" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Priority Matrix"
                onClick={onOpenPriorityMatrix}
              >
                <IconChartDots {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="List View" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="List View"
                onClick={onOpenListView}
              >
                <IconList {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Status Summary" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Status Summary"
                onClick={onOpenStatusSummary}
              >
                <IconInfoCircle {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Internal notes" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Internal notes"
                onClick={onOpenReleaseNotes}
              >
                <IconNotes {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={isBudgetOverviewVisible ? 'Hide budget overview' : 'Show budget overview'} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant={isBudgetOverviewVisible || hasBudgetAlert ? 'filled' : 'default'}
                color={hasBudgetAlert ? 'red' : isBudgetOverviewVisible ? 'teal' : undefined}
                aria-label={isBudgetOverviewVisible ? 'Hide budget overview' : 'Show budget overview'}
                onClick={onToggleBudgetOverview}
              >
                <Text size="xs" fw={700}>SP</Text>
              </ActionIcon>
            </Tooltip>

            <Tooltip label={isLegendVisible ? 'Hide legend' : 'Show legend'} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant={isLegendVisible ? 'filled' : 'default'}
                color={isLegendVisible ? 'cyan' : undefined}
                aria-label={isLegendVisible ? 'Hide legend' : 'Show legend'}
                onClick={onToggleLegend}
              >
                <IconInfoCircle {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Menu shadow="md" width={260} position="bottom-start" withArrow closeOnItemClick={false}>
              <Menu.Target>
                <Tooltip label={`Filter: ${selectedReleaseFilterLabel}${scopeOptions.length > 0 ? ' · ' + selectedScopeFilterLabel : ''}`} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                  <ActionIcon
                    size="md"
                    variant={hasActiveFilters ? 'filled' : 'default'}
                    color={hasActiveFilters ? 'yellow' : undefined}
                    aria-label={hasActiveFilters ? 'Filter (active)' : 'Filter'}
                    disabled={false}
                  >
                    <IconFilter {...TOOLBAR_ICON_PROPS} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Filter</Menu.Label>
                <Menu.Label>Statuses</Menu.Label>
                <Menu.Item onClick={handleResetStatusFilterModes}>
                  {hasActiveStatusFilterModes(statusFilterModeByKey) ? '' : '● '}All Statuses
                </Menu.Item>
                <Menu.Item onClick={() => handleSetAllStatusFilterModes(STATUS_VISIBILITY_MODES.visible)}>
                  Show all
                </Menu.Item>
                <Menu.Item onClick={() => handleSetAllStatusFilterModes(STATUS_VISIBILITY_MODES.minimized)}>
                  Minimize all
                </Menu.Item>
                <Menu.Item onClick={() => handleSetAllStatusFilterModes(STATUS_VISIBILITY_MODES.hidden)}>
                  Hide all
                </Menu.Item>
                {STATUS_FILTER_ORDER.map((statusKey) => {
                  const statusStyle = statusStyles[statusKey] ?? statusStyles.later ?? STATUS_STYLES.later
                  const usesDashedLine = statusStyle.linkStrokeDasharray && statusStyle.linkStrokeDasharray !== 'none'
                  const visibilityMode = statusFilterModeByKey[statusKey] ?? STATUS_VISIBILITY_MODES.visible
                  return (
                    <Menu.Item key={statusKey} onClick={() => handleSetStatusFilterMode(statusKey, STATUS_VISIBILITY_MODES.visible)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8 }}>
                        <span
                          className="skill-node-tooltip__scope"
                          style={{
                            borderColor: statusStyle.badge,
                            color: statusStyle.badge,
                            borderStyle: usesDashedLine ? 'dashed' : 'solid',
                          }}
                        >
                          {STATUS_LABELS[statusKey] ?? statusKey}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ActionIcon
                            size="xs"
                            variant={visibilityMode === STATUS_VISIBILITY_MODES.visible ? 'filled' : 'default'}
                            color={statusStyle.badge}
                            aria-label={`${STATUS_LABELS[statusKey] ?? statusKey}: visible`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleSetStatusFilterMode(statusKey, STATUS_VISIBILITY_MODES.visible)
                            }}
                          >
                            <IconEye size={14} stroke={1.8} />
                          </ActionIcon>
                          <ActionIcon
                            size="xs"
                            variant={visibilityMode === STATUS_VISIBILITY_MODES.minimized ? 'filled' : 'default'}
                            color={statusStyle.badge}
                            aria-label={`${STATUS_LABELS[statusKey] ?? statusKey}: minimized`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleSetStatusFilterMode(statusKey, STATUS_VISIBILITY_MODES.minimized)
                            }}
                          >
                            <IconArrowsMinimize size={14} stroke={1.8} />
                          </ActionIcon>
                          <ActionIcon
                            size="xs"
                            variant={visibilityMode === STATUS_VISIBILITY_MODES.hidden ? 'filled' : 'default'}
                            color={statusStyle.badge}
                            aria-label={`${STATUS_LABELS[statusKey] ?? statusKey}: hidden`}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              handleSetStatusFilterMode(statusKey, STATUS_VISIBILITY_MODES.hidden)
                            }}
                          >
                            <IconEyeOff size={14} stroke={1.8} />
                          </ActionIcon>
                        </span>
                      </span>
                    </Menu.Item>
                  )
                })}
                <Menu.Divider />
                <Menu.Label>Scopes</Menu.Label>
                <Menu.Item onClick={() => setSelectedScopeFilterId?.(SCOPE_FILTER_ALL)}>
                  {selectedScopeFilterIds.length === 0 ? '● ' : ''}All Scopes
                </Menu.Item>
                {(() => {
                  const normalizedGroupKey = (color) => (
                    typeof color === 'string' && color.trim().length > 0
                      ? color.trim().toLowerCase()
                      : '__none__'
                  )

                  const groups = []
                  const groupByKey = new Map()

                  for (const scope of scopeOptions) {
                    const groupKey = normalizedGroupKey(scope.color)
                    if (!groupByKey.has(groupKey)) {
                      const group = {
                        key: groupKey,
                        color: scope.color ?? null,
                        label: scope.groupLabel || (scope.color ? scope.color.toUpperCase() : null),
                        scopes: [],
                      }
                      groupByKey.set(groupKey, group)
                      groups.push(group)
                    }

                    groupByKey.get(groupKey).scopes.push(scope)
                  }

                  return groups.flatMap((group) => {
                    const renderedItems = []

                    if (group.label) {
                      renderedItems.push(
                        <Menu.Label key={`group-${group.key}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {group.color && (
                            <span style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: group.color,
                              flexShrink: 0,
                            }} />
                          )}
                          {group.label}
                        </Menu.Label>
                      )
                    }

                    for (const scope of group.scopes) {
                      const isSelected = selectedScopeFilterIds.includes(scope.value)
                      renderedItems.push(
                        <Menu.Item key={scope.value} onClick={() => handleToggleScopeFilter(scope.value)}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {isSelected ? '● ' : ''}
                            <span
                              className="skill-node-tooltip__scope"
                              style={scope.color ? {
                                borderColor: scope.color,
                                color: scope.color,
                              } : undefined}
                            >
                              {scope.label}
                            </span>
                          </span>
                        </Menu.Item>
                      )
                    }

                    return renderedItems
                  })
                })()}
              </Menu.Dropdown>
            </Menu>

            <Tooltip
              label={hiddenNodeCount === 0 ? 'No hidden nodes' : showHiddenNodes ? 'Showing hidden nodes as ghosts — click to hide' : `${hiddenNodeCount} hidden node${hiddenNodeCount !== 1 ? 's' : ''} — click to show as ghosts`}
              position="top"
              middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}
            >
              <ActionIcon
                size="md"
                variant={showHiddenNodes ? 'filled' : 'default'}
                color={showHiddenNodes ? 'violet' : undefined}
                aria-label={showHiddenNodes ? 'Hide ghost nodes' : 'Show hidden nodes as ghosts'}
                onClick={onToggleShowHiddenNodes}
                style={{ position: 'relative' }}
                disabled={hiddenNodeCount === 0}
              >
                {showHiddenNodes ? <IconEye {...TOOLBAR_ICON_PROPS} /> : <IconEyeOff {...TOOLBAR_ICON_PROPS} />}
                {hiddenNodeCount > 0 && (
                  <span
                    aria-label={`${hiddenNodeCount} hidden`}
                    style={{
                      position: 'absolute',
                      top: -5,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#7c3aed',
                      color: '#fff',
                      borderRadius: '999px',
                      fontSize: 9,
                      fontWeight: 700,
                      lineHeight: 1,
                      minWidth: 14,
                      height: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 3px',
                      pointerEvents: 'none',
                    }}
                  >{hiddenNodeCount}</span>
                )}
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <div className="skill-tree-toolbar__search">
              <input
                aria-label="Node search"
                placeholder="Search nodes…"
                value={toolbarSearch}
                onChange={(e) => setToolbarSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <ul className="skill-tree-toolbar__search-results" role="listbox">
                  {searchResults.map((node) => (
                    <li
                      key={node.id}
                      role="option"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        onSelectNode(node.id)
                        setToolbarSearch('')
                      }}
                    >
                      {node.label} {node.shortName ? `(${node.shortName})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {releases.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Select
                  size="xs"
                  value={selectedReleaseId}
                  onChange={(val) => val && onReleaseChange?.(val)}
                  data={releases.map((r) => ({
                    value: r.id,
                    label: r.name || 'Release',
                  }))}
                  classNames={{ input: 'mantine-dark-input' }}
                  style={{ minWidth: 120, maxWidth: 180 }}
                  aria-label="Select release"
                  allowDeselect={false}
                />
              </div>
            )}
            <Text size="xs" c="dimmed" className="skill-tree-toolbar__status">{autosaveLabel}</Text>
          </div>
        </div>
      </div>
    </Paper>
  )
}

export default SkillTreeToolbar
