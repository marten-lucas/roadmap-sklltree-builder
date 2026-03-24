import { ActionIcon, Menu, Paper, Text, Tooltip } from '@mantine/core'
import { useMemo, useState } from 'react'
import { IconDownload, IconFilter, IconFilters, IconPercentage20, IconUpload } from '@tabler/icons-react'

const ToolbarIcon = ({ children }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

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
        <Tooltip label={isCollapsed ? 'Menü aufklappen' : 'Menü einklappen'} withArrow openDelay={120}>
          <ActionIcon
            size="md"
            variant="default"
            aria-label={isCollapsed ? 'Menü aufklappen' : 'Menü einklappen'}
            onClick={onToggleCollapsed}
          >
            <ToolbarIcon>
              {isCollapsed ? (
                <path d="m9 6 6 6-6 6" />
              ) : (
                <path d="m15 6-6 6 6 6" />
              )}
            </ToolbarIcon>
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
                <Tooltip label="Export (Klick: HTML, Hover: weitere Formate)" withArrow openDelay={120}>
                  <ActionIcon
                    size="md"
                    variant="default"
                    aria-label="Export"
                    onClick={onExportHtml}
                  >
                    <IconDownload size={18} stroke={2} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Export</Menu.Label>
                <Menu.Item onClick={onExportPdf} title="PDF (statisch)">
                  PDF
                </Menu.Item>
                <Menu.Item onClick={onExportSvg} title="SVG (interaktiv)">
                  SVG
                </Menu.Item>
                <Menu.Item onClick={onExportCleanSvg} title="SVG (clean)">
                  SVG (clean)
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            <Tooltip label="HTML importieren (Ctrl+O)" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="HTML importieren"
                onClick={onOpenDocumentPicker}
              >
                <IconUpload size={18} stroke={2} />
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Undo (Ctrl+Z)" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Undo"
                onClick={onUndo}
                disabled={!canUndo}
              >
                <ToolbarIcon>
                  <path d="M3 7h7" />
                  <path d="m3 7 3-3" />
                  <path d="m3 7 3 3" />
                  <path d="M21 14a7 7 0 0 0-7-7H9" />
                </ToolbarIcon>
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Redo (Ctrl+Y / Ctrl+Shift+Z)" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Redo"
                onClick={onRedo}
                disabled={!canRedo}
              >
                <ToolbarIcon>
                  <path d="M21 7h-7" />
                  <path d="m21 7-3-3" />
                  <path d="m21 7-3 3" />
                  <path d="M3 14a7 7 0 0 1 7-7h5" />
                </ToolbarIcon>
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Reset (Ctrl+Shift+Backspace)" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="subtle"
                color="red"
                aria-label="Reset"
                onClick={onReset}
              >
                <ToolbarIcon>
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-8.87" />
                </ToolbarIcon>
              </ActionIcon>
            </Tooltip>
          </div>

          <div className="skill-tree-toolbar__cluster">
            <Tooltip label="Segmente verwalten" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Segmente verwalten"
                onClick={onOpenSegmentManager}
              >
                <IconPercentage20 stroke={2} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Scopes verwalten" withArrow openDelay={120}>
              <ActionIcon
                size="md"
                variant="default"
                aria-label="Scopes verwalten"
                onClick={onOpenScopeManager}
              >
                <IconFilters stroke={2} />
              </ActionIcon>
            </Tooltip>

            <Menu shadow="md" width={260} position="bottom-start" withArrow>
              <Menu.Target>
                <Tooltip label={`Filter: ${selectedReleaseFilterLabel}${scopeOptions.length > 0 ? ' · ' + selectedScopeFilterLabel : ''}`} withArrow openDelay={120}>
                  <ActionIcon
                    size="md"
                    variant="default"
                    aria-label="Filter"
                    disabled={false}
                  >
                    <IconFilter stroke={2} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Filter</Menu.Label>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.all)} title="Show all items">
                  {releaseFilter === RELEASE_FILTER_OPTIONS.all ? '● ' : ''}All
                </Menu.Item>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.now)} title="Now — Done minimal, Later hidden">
                  {releaseFilter === RELEASE_FILTER_OPTIONS.now ? '● ' : ''}Now
                </Menu.Item>
                <Menu.Item onClick={() => setReleaseFilter?.(RELEASE_FILTER_OPTIONS.next)} title="Next — Done/Later minimal">
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
