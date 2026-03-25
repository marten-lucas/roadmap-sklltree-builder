import { ActionIcon, Menu, Paper, Text } from '@mantine/core'
import { useMemo, useState } from 'react'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconFilter,
  IconFilters,
  IconPercentage20,
  IconRefresh,
  IconUpload,
} from '@tabler/icons-react'
import { Tooltip } from '../tooltip'

const TOOLBAR_ICON_PROPS = {
  size: 18,
  stroke: 2.5,
}

const TOOLBAR_TOOLTIP_MIDDLEWARES = {
  flip: false,
  shift: false,
  inline: false,
}

const RELEASE_FILTER_OPTIONS = {
  all: 'all',
  now: 'now',
  next: 'next',
}

const SCOPE_FILTER_ALL = '__all__'

export function SkillTreeToolbar({
  isCollapsed,
  onToggleCollapsed,
  onOpenDocumentPicker,
  onExportHtml,
  onExportPdf,
  onExportSvg,
  onExportCleanSvg,
  onUndo,
  canUndo,
  onRedo,
  canRedo,
  onReset,
  onOpenSegmentManager,
  onOpenScopeManager,
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
}) {
  const [toolbarSearch, setToolbarSearch] = useState('')

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

  return (
    <Paper
      className={isCollapsed ? 'skill-tree-toolbar skill-tree-toolbar--collapsed' : 'skill-tree-toolbar'}
      radius="xl"
      shadow="xl"
      withBorder
    >
      <div className="skill-tree-toolbar__row">
        <Tooltip label={isCollapsed ? 'Menü aufklappen' : 'Menü einklappen'} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
          <ActionIcon
            size="md"
            variant="default"
            aria-label={isCollapsed ? 'Menü aufklappen' : 'Menü einklappen'}
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
                <Tooltip label="Export (Klick: HTML, Hover: weitere Formate)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
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
                <Menu.Item onClick={onExportPdf}>
                  PDF
                </Menu.Item>
                <Menu.Item onClick={onExportSvg}>
                  SVG
                </Menu.Item>
                <Menu.Item onClick={onExportCleanSvg}>
                  SVG (clean)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Tooltip label="HTML importieren (Ctrl+O)" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="HTML importieren"
                onClick={onOpenDocumentPicker}
              >
                <IconDownload {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>
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
            <Tooltip label="Segmente verwalten" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Segmente verwalten"
                onClick={onOpenSegmentManager}
              >
                <IconPercentage20 {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Scopes verwalten" position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Scopes verwalten"
                onClick={onOpenScopeManager}
              >
                <IconFilters {...TOOLBAR_ICON_PROPS} />
              </ActionIcon>
            </Tooltip>

            <Menu shadow="md" width={260} position="bottom-start" withArrow>
              <Menu.Target>
                <Tooltip label={`Filter: ${selectedReleaseFilterLabel}${scopeOptions.length > 0 ? ' · ' + selectedScopeFilterLabel : ''}`} position="top" middlewares={TOOLBAR_TOOLTIP_MIDDLEWARES}>
                  <ActionIcon
                    size="md"
                    variant="default"
                    aria-label="Filter"
                    disabled={false}
                  >
                    <IconFilter {...TOOLBAR_ICON_PROPS} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Filter</Menu.Label>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.all)}>
                  {releaseFilter === RELEASE_FILTER_OPTIONS.all ? '● ' : ''}All
                </Menu.Item>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.now)}>
                  {releaseFilter === RELEASE_FILTER_OPTIONS.now ? '● ' : ''}Now
                </Menu.Item>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.next)}>
                  {releaseFilter === RELEASE_FILTER_OPTIONS.next ? '● ' : ''}Next
                </Menu.Item>
                <Menu.Divider />
                <Menu.Label>Scopes</Menu.Label>
                <Menu.Item onClick={() => setSelectedScopeFilterId?.(SCOPE_FILTER_ALL)}>
                  {selectedScopeFilterId === SCOPE_FILTER_ALL ? '● ' : ''}Alle Scopes
                </Menu.Item>
                {scopeOptions.map((scope) => (
                  <Menu.Item key={scope.value} onClick={() => setSelectedScopeFilterId?.(scope.value)}>
                    {selectedScopeFilterId === scope.value ? '● ' : ''}{scope.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <div className="skill-tree-toolbar__search">
              <input
                aria-label="Node search"
                placeholder="Suche Knoten…"
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
            <Text size="xs" c="dimmed" className="skill-tree-toolbar__status">{autosaveLabel}</Text>
          </div>
        </div>
      </div>
    </Paper>
  )
}

export default SkillTreeToolbar
