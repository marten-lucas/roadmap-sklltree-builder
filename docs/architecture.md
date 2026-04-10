# Architecture

This document describes the component hierarchy, data flow, and module responsibilities for the Roadmap Skill Tree Builder.

---

## Table of Contents

- [High-Level Overview](#high-level-overview)
- [React Component Tree](#react-component-tree)
- [Module Map](#module-map)
- [Data Flow](#data-flow)
- [State Management](#state-management)
- [Persistence](#persistence)
- [Export Pipeline](#export-pipeline)
- [Build Output](#build-output)

---

## High-Level Overview

```
User Interaction
      │
      ▼
┌─────────────────────────────────────────────┐
│  SkillTree.jsx  (top-level component)        │
│  ├── useSkillTreeUiState hook               │
│  ├── SkillTreeToolbar                       │
│  ├── SkillTreeCanvas (SVG + zoom/pan)       │
│  └── Panels (Inspector, Segment, System…)  │
└─────────────────────────────────────────────┘
      │  pure-logic utils (no React)
      ▼
┌─────────────────────────────────────────────┐
│  utils/                                      │
│  ├── documentState.js  ← document model     │
│  ├── treeData.js       ← tree mutations      │
│  ├── layoutSolver.js   ← layout engine       │
│  ├── treeValidation.js ← constraint checks   │
│  ├── csv.js            ← import / export     │
│  ├── htmlExport.js     ← HTML export         │
│  ├── svgExport.js      ← SVG export          │
│  └── pdfExport.js      ← PDF export          │
└─────────────────────────────────────────────┘
      │
      ▼
  localStorage  /  file download / in-memory viewer
```

---

## React Component Tree

```
App.jsx
└── SkillTree.jsx
    ├── SkillTreeToolbar
    │   └── toolbar actions: import CSV, export HTML/SVG/PDF,
    │       undo/redo, reset, settings
    ├── SkillTreeCanvas
    │   ├── SVG skill-tree-canvas
    │   │   ├── segment arcs & separator lines
    │   │   ├── edge paths (line connections & portal icons)
    │   │   └── node foreignObjects
    │   │       └── node cards (label, status badge, add/delete controls)
    │   └── center icon + center metadata trigger
    ├── InspectorPanel (slides in when a node is selected)
    │   ├── node name / short-name fields
    │   ├── status selector (Done / Now / Next / Later / Hidden)
    │   ├── ebene (level override) selector
    │   ├── segment selector
    │   ├── effort & benefit selectors
    │   ├── scope tag selector (per level)
    │   ├── release note markdown editor
    │   └── delete node / delete branch buttons
    ├── SegmentPanel (segment management drawer)
    │   ├── segment list with drag-reorder
    │   └── add / rename / delete segment
    ├── SystemPanel (global settings)
    │   ├── show/hide hidden nodes toggle
    │   ├── center icon upload
    │   ├── scope manager
    │   └── release manager
    ├── PriorityMatrix (effort × benefit 2D view)
    └── ListViewDrawer (flat list of all nodes)
```

---

## Module Map

### `src/components/utils/`

| Module | Responsibility |
|---|---|
| `treeData.js` | All tree mutations (add/delete/move/rename node, add level, etc.). All functions are **pure** — they return new objects and never mutate in place. |
| `treeValidation.js` | Change-scoped constraint checking. Computes a baseline snapshot, applies the proposed change, then returns only *newly introduced* violations. |
| `layoutSolver.js` | Entry point for the full layout pipeline. Calls into the modules below and returns `{ layout, diagnostics, meta }`. |
| `levelAssignment.js` | Multi-phase level resolver (auto-promotion, crossing-promotion, compaction, subtree re-rooting). |
| `edgeRouter.js` | Determines the radial polyline path for each tree edge. Detects whether an edge must become a portal. |
| `edgeCrossings.js` | Geometric crossing detection between radial polyline paths and circular arcs. |
| `radialPacker.js` | Assigns angular positions to nodes on each ring, respecting minimum-gap and capacity constraints. |
| `segmentOptimizer.js` | Greedy segment-ordering with swap refinement to minimise cross-segment edge lengths. |
| `layoutMath.js` | Shared polar ↔ Cartesian conversions, arc length helpers. |
| `layoutModel.js` | Immutable layout data structures. |
| `layoutDiagnostics.js` | Collects and formats diagnostic messages from the layout pipeline. |
| `layoutFeasibility.js` | Hard capacity loop — grows radius until all nodes fit with minimum gap, or declares infeasible. |
| `layoutShared.js` | Shared constants and helpers used across layout modules. |
| `documentState.js` | `createEmptyDocument()`, `ensureDocumentDefaults()`, document-level normalization. |
| `documentPersistence.js` | Serialize / deserialize to localStorage. Schema migration (v1→v2→v3). |
| `csv.js` | `readDocumentFromCsvText()` and `exportDocumentToCsvText()`. Full CSV round-trip. |
| `htmlExport.js` | Produces a self-contained HTML file from the current document + live canvas SVG. |
| `svgExport.js` | Serializes the canvas SVG with inlined styles and embedded tooltips. |
| `pdfExport.js` | Renders release notes as HTML, then uses the browser print API to produce a PDF. |
| `effortBenefit.js` | Size constants (`xs/s/m/l/xl/custom`), normalization, story-point mapping. |
| `releases.js` | CRUD helpers for the `releases[]` array in the document. |
| `nodeStatus.js` | Status normalization and per-release status resolution. |
| `visibility.js` | `isNodeVisible()` — filters hidden nodes based on `showHiddenNodes` flag. |
| `selection.js` | Multi-select state helpers. |
| `keyboardShortcuts.js` | Keyboard shortcut definitions and handler registration. |
| `panelsState.js` | Which panel (inspector / segment / system / matrix) is currently open. |
| `viewport.js` | Viewport pan/zoom state. |
| `scopeDisplay.js` | Renders scope-tag badges in exports. |
| `markdown.js` | Minimal CommonMark renderer used for release notes in exports. |
| `dom.js` | Browser DOM helpers (used in SVG/HTML export flows). |
| `file.js` | Browser file-download helper. |
| `uuid.js` | `generateUUID()` wrapper. |
| `angle.js` | Angular math helpers. |
| `array.js` | Generic array utilities. |
| `messages.js` | Human-readable diagnostic message strings. |
| `matrixLayout.js` | Priority-matrix (effort × benefit grid) layout logic. |
| `releaseNoteDraft.js` | Auto-generates a release note draft from node data. |
| `inspectorCommit.js` | Commit helpers that create the "pending change" object before calling treeData mutations. |

---

## Data Flow

### Normal Edit Cycle

```
User action (e.g., rename node in Inspector)
    │
    ▼
useSkillTreeUiState.dispatch(action)
    │
    ├── treeData mutation  →  new document tree
    │
    ├── push to undo stack
    │
    ├── documentPersistence.save()  →  localStorage
    │
    └── layoutSolver.solveSkillTreeLayout(newTree)
             │
             ▼
         layout result { nodes[], links[], segments[], diagnostics }
             │
             ▼
         SkillTreeCanvas re-renders SVG
```

### CSV Import

```
User drops / selects .csv file
    │
    ▼
csv.readDocumentFromCsvText(text)
    │  parses rows, resolves parents, builds tree + segments + scopes + releases
    ▼
new document object
    │
    ▼
useSkillTreeUiState.dispatch({ type: 'LOAD_DOCUMENT', … })
    │
    ▼
save to localStorage  +  solve layout  +  re-render
```

### HTML Export

```
exportHtml() called from toolbar
    │
    ├── htmlExport.canonicalizeDocumentForExport(doc)  ← dedup scopes
    │
    ├── svgExport.serializeSvgElementForExport(svgEl)  ← clone + inline styles
    │
    ├── documentPersistence.serializeDocumentPayload(doc)
    │
    └── inject data + svg + html-to-image bundle into export template
             │
             ▼
         Single .html file  →  file.triggerDownload()
```

---

## State Management

The app uses a single custom hook (`useSkillTreeUiState`) that holds the complete application state:

```
{
  document,          // the full skill-tree document
  layout,            // solved layout (nodes, links, segments)
  diagnostics,       // layout / validation messages
  undoStack,         // array of past document snapshots
  redoStack,         // array of future document snapshots
  selectedNodeId,    // currently focused node
  selectedLevelId,   // currently focused level (per node)
  selectedReleaseId, // active release in inspector
  multiSelectIds,    // set of node IDs in multi-select
  panels,            // which panel is open
  viewport,          // pan/zoom state
  showHiddenNodes,   // global toggle
}
```

All document mutations go through the dispatch function, which:
1. Applies the mutation via `treeData` helpers
2. Pushes the old document onto the undo stack (capped at 100 entries)
3. Saves to localStorage
4. Triggers a new layout solve

---

## Persistence

Documents are stored in `localStorage` under the key `roadmap-skilltree.document.v1`.

The serialized payload is:
```json
{
  "schemaVersion": 3,
  "document": { … }
}
```

### Schema Versions

| Version | Key change |
|---|---|
| v1 | `node.additionalDependencyIds` = array of node IDs |
| v2 | `level.additionalDependencyLevelIds` = array of level IDs (per-level) |
| v3 | `level.statuses` = `{ [releaseId]: statusKey }` map (multi-release per level) |

On load, `documentPersistence.parseDocumentPayload()` runs the appropriate migration chain automatically.

---

## Export Pipeline

### HTML Export
`htmlExport.js` produces a standalone HTML file containing:
- The skill-tree document as a JSON `<script>` tag (`id="skilltree-export-data"`)
- A serialized SVG snapshot of the canvas
- The `html-to-image` library bundled inline (for PNG download from within the viewer)
- A minimal CSS reset and viewer layout

The viewer parses the embedded JSON on load — no server round-trip needed.

### SVG Export
`svgExport.js` clones the live SVG DOM element, inlines all computed styles, replaces `foreignObject` node cards with SVG text equivalents, and serializes to a UTF-8 XML string.

### PDF Export
`pdfExport.js` renders release notes (markdown → HTML) into a hidden `<div>` and triggers `window.print()`. The browser's print dialog handles pagination and PDF save.

---

## Build Output

`vite.config.js` includes a custom `singleFileHtmlPlugin` that post-processes the Vite build output:

1. Reads `dist/index.html`
2. For each JS chunk: replaces `<script src="…">` with `<script type="module">…inlined code…</script>`
3. For each CSS asset: replaces `<link rel="stylesheet">` with `<style>…inlined css…</style>`
4. Minifies whitespace and removes HTML comments
5. Writes `dist/roadmap-skilltree-builder.html`

The original chunked files under `dist/assets/` remain alongside it.
