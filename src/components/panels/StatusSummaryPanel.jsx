import { ActionIcon, Paper, Stack, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import { BENEFIT_SIZE_LABELS, getNodeDisplayBenefit } from '../utils/effortBenefit'
import {
  STATUS_SUMMARY_SORT_OPTIONS,
  buildStatusSummaryGroups,
  getStatusSummarySortLabel,
  normalizeStatusSummarySettings,
  reorderStatusSummaryNode,
  updateStatusSummarySortMode,
} from '../utils/statusSummary'

export function StatusSummaryPanel({
  roadmapData,
  selectedReleaseId = null,
  onClose,
  onCommitDocument,
  onSelectNode,
}) {
  const [dragState, setDragState] = useState({
    nodeId: null,
    statusKey: null,
    overNodeId: null,
  })

  const summarySettings = useMemo(
    () => normalizeStatusSummarySettings(roadmapData?.statusSummary),
    [roadmapData?.statusSummary],
  )

  const sortMode = summarySettings.sortMode
  const isManualMode = sortMode === 'manual'

  const groups = useMemo(() => buildStatusSummaryGroups(roadmapData, {
    sortMode,
    selectedReleaseId,
  }), [roadmapData, selectedReleaseId, sortMode])

  const resetDragState = () => {
    setDragState({ nodeId: null, statusKey: null, overNodeId: null })
  }

  const handleSortModeChange = (event) => {
    const nextSortMode = event.currentTarget.value
    const nextDocument = updateStatusSummarySortMode(roadmapData, nextSortMode)
    onCommitDocument?.(nextDocument)
  }

  const handleDropOnNode = (statusKey, targetNodeId) => (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isManualMode || !dragState.nodeId || dragState.statusKey !== statusKey) {
      resetDragState()
      return
    }

    const nextDocument = reorderStatusSummaryNode(roadmapData, statusKey, dragState.nodeId, targetNodeId)
    onCommitDocument?.(nextDocument)
    resetDragState()
  }

  const handleDropOnGroup = (statusKey) => (event) => {
    event.preventDefault()

    if (!isManualMode || !dragState.nodeId || dragState.statusKey !== statusKey) {
      resetDragState()
      return
    }

    const nextDocument = reorderStatusSummaryNode(roadmapData, statusKey, dragState.nodeId)
    onCommitDocument?.(nextDocument)
    resetDragState()
  }

  return (
    <Paper className="skill-panel skill-panel--status-summary" radius="xl" shadow="xl">
      <div className="skill-panel__header">
        <div>
          <Text className="skill-panel__eyebrow">Delivery</Text>
          <Text className="skill-panel__title">Status Summary</Text>
        </div>
        <div className="skill-panel__header-actions">
          <ActionIcon variant="subtle" color="gray" onClick={onClose} aria-label="Close status summary">
            ✕
          </ActionIcon>
        </div>
      </div>

      <div className="skill-panel__body skill-panel__body--scrollable">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Prioritize features inside the same status and reuse the selected sort order for exports.
          </Text>

          <label className="status-summary-panel__field">
            <span className="status-summary-panel__field-label">Sort order</span>
            <select className="status-summary-panel__select" value={sortMode} onChange={handleSortModeChange} aria-label="Status summary sort order">
              {STATUS_SUMMARY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <Text size="xs" c="dimmed">
            {isManualMode
              ? 'Drag and drop is active for items inside the same status.'
              : `Sorted by ${getStatusSummarySortLabel(sortMode)}. Switch to Manual delivery order to rearrange items.`}
          </Text>

          <div className="status-summary-panel__groups">
            {groups.map((group) => (
              <section
                key={group.statusKey}
                className="status-summary-panel__group"
                onDragOver={(event) => {
                  if (isManualMode && dragState.statusKey === group.statusKey) {
                    event.preventDefault()
                  }
                }}
                onDrop={handleDropOnGroup(group.statusKey)}
              >
                <header className="status-summary-panel__group-header">
                  <span>{group.label}</span>
                  <span className="status-summary-panel__count">{group.nodes.length}</span>
                </header>

                {group.nodes.length === 0 ? (
                  <p className="status-summary-panel__empty">No features</p>
                ) : (
                  <div className="status-summary-panel__items">
                    {group.nodes.map((node, index) => {
                      const isDragged = dragState.nodeId === node.id
                      const isDropTarget = dragState.overNodeId === node.id && dragState.statusKey === group.statusKey
                      const benefitLabel = BENEFIT_SIZE_LABELS[getNodeDisplayBenefit(node).size] ?? 'Unclear'

                      return (
                        <div
                          key={node.id}
                          className={`status-summary-panel__item${isDragged ? ' status-summary-panel__item--dragged' : ''}${isDropTarget ? ' status-summary-panel__item--drop-target' : ''}`}
                          draggable={isManualMode}
                          onClick={() => onSelectNode?.(node.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              onSelectNode?.(node.id)
                            }
                          }}
                          onDragStart={(event) => {
                            if (!isManualMode) {
                              event.preventDefault()
                              return
                            }

                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', node.id)
                            setDragState({ nodeId: node.id, statusKey: group.statusKey, overNodeId: null })
                          }}
                          onDragOver={(event) => {
                            if (!isManualMode || dragState.statusKey !== group.statusKey) {
                              return
                            }

                            event.preventDefault()
                            if (dragState.overNodeId !== node.id) {
                              setDragState((current) => ({ ...current, overNodeId: node.id }))
                            }
                          }}
                          onDrop={handleDropOnNode(group.statusKey, node.id)}
                          onDragEnd={resetDragState}
                          role="button"
                          tabIndex={0}
                          aria-label={`Select ${node.label ?? node.shortName ?? 'feature'}`}
                        >
                          <span className="status-summary-panel__item-rank">{index + 1}</span>
                          <span className={`status-summary-panel__drag-handle${isManualMode ? '' : ' status-summary-panel__drag-handle--disabled'}`} aria-hidden="true">⋮</span>
                          <div className="status-summary-panel__item-copy">
                            <span className="status-summary-panel__item-title">{node.label || node.shortName || 'Untitled feature'}</span>
                            <span className="status-summary-panel__item-meta">
                              {node.shortName ? `${node.shortName} · ` : ''}Value {benefitLabel}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </Stack>
      </div>
    </Paper>
  )
}
