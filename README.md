# Roadmap Skill Tree Builder

A browser-based radial skill-tree / roadmap visualizer. Build, annotate, and export interactive skill trees from scratch or from a CSV file. The production artifact is a **single self-contained HTML file** that can be opened offline or shared without a server.

## 🚀 DEMO

**Try the live demo here:** https://marten-lucas.github.io/roadmap-sklltree-builder/

The published demo is deployed from the latest GitHub release and can be used directly in the browser.

---

## Table of Contents

- [Live Demo](#-demo)
- [Features](#features)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Build](#build)
- [GitHub Pages Release Deploy](#github-pages-release-deploy)
- [Testing](#testing)
- [E2E Dataset & Phase Selection](#e2e-dataset--phase-selection)
- [Environment Variables](#environment-variables)
- [Configuration](#configuration)
- [Architecture Overview](#architecture-overview)
- [Further Reading](#further-reading)

---

## Features

### Layout Engine
- **Radial Concentric Layout** — D3-hierarchy positioning with angular spread control (max 270°)
- **Segment-Aware Packing** — angular space is divided proportionally across skill domains (segments)
- **Multi-Phase Solver** — four automatic adjustment phases (auto-promotion, crossing-promotion, compaction, re-rooting) minimize edge crossings
- **Deterministic Output** — identical input always produces identical layout
- **Capacity Checking** — hard feasibility detection with iterative radius adjustment

### Data & Editing
- **CSV Import / Export** — full round-trip via a structured CSV format (see [docs/csv-format.md](docs/csv-format.md))
- **Node Inspector** — per-node label, status, segment, effort/benefit, scope tags, release notes
- **Segment Manager** — create, rename, reorder, and delete topic segments
- **Multi-select** — bulk status/segment changes
- **Undo / Redo** — full history stack (100 entries)
- **Hidden Nodes** — nodes with status `hidden` are excluded from layout and exports unless opted in
- **Additional Dependencies** — non-hierarchy dependency edges rendered as portal connections

### Exports
- **HTML Export** — fully self-contained interactive viewer (inlined JS, CSS, data)
- **SVG Export** — vector snapshot of the current canvas
- **PDF Export** — release notes rendered as paginated PDF

### Validation
- **Change-Scoped** — only *newly introduced* constraint violations block a mutation
- **Pre-existing issues** are surfaced as warnings but never block valid edits

---

## Quick Start

```bash
npm install
npm run dev        # dev server at http://localhost:5173
```

---

## Project Structure

```
roadmap-skilltree-builder/
├── index.html
├── vite.config.js             # Single-file HTML build plugin
├── vitest.config.js
├── playwright.config.js
├── src/
│   ├── main.jsx
│   ├── App.jsx                # Root — renders <SkillTree />
│   └── components/
│       ├── SkillTree.jsx      # Top-level component
│       ├── config.js          # TREE_CONFIG, STATUS_* constants
│       ├── skillTree.css
│       ├── canvas/            # SVG canvas + zoom/pan
│       ├── hooks/             # React hooks (UI state, keyboard, etc.)
│       ├── nodes/             # Node rendering
│       ├── panels/            # Inspector, Segment, System, Priority Matrix panels
│       ├── toolbar/           # Toolbar with import/export actions
│       ├── tooltip/           # Tooltip styles and rendering
│       └── utils/             # All pure-logic modules
│           ├── treeData.js        # Tree mutations & traversal
│           ├── treeValidation.js  # Constraint checking
│           ├── layoutSolver.js    # Core layout engine
│           ├── levelAssignment.js # Multi-phase level resolver
│           ├── edgeRouter.js      # Radial polyline routing
│           ├── edgeCrossings.js   # Crossing detection
│           ├── documentState.js   # Document model & normalization
│           ├── documentPersistence.js  # localStorage + schema migration
│           ├── csv.js             # CSV import / export
│           ├── htmlExport.js      # Self-contained HTML export
│           ├── svgExport.js       # SVG export
│           ├── pdfExport.js       # PDF (release notes) export
│           ├── effortBenefit.js   # Effort/Benefit size normalisation
│           ├── releases.js        # Release CRUD helpers
│           ├── visibility.js      # Hidden-node filtering
│           └── ...
│       └── __tests__/         # Vitest unit & integration tests
├── tests/
│   └── e2e/                   # Playwright end-to-end tests
│       ├── datasets/          # CSV fixtures (minimal/small/medium/large/huge)
│       └── helpers.js         # Shared Playwright helpers
└── docs/
    ├── architecture.md
    ├── csv-format.md
    ├── data-model.md
    ├── testing-guide.md
    └── layout-and-routing-algorithms.md
```

---

## Build

```bash
npm run build
npm run build:pages
```

- `npm run build` produces `dist/roadmap-skilltree-builder.html` — a single minified file with all JS, CSS, and the html-to-image library inlined.
- `npm run build:pages` additionally prepares `dist/index.html` and `.nojekyll` for direct GitHub Pages publishing.

No server required to open it.

---

## GitHub Pages Release Deploy

The repository includes a GitHub Actions workflow for controlled Pages deployment.

- Regular commits do not publish the site.
- The Pages site is updated only when a GitHub Release is published.
- The workflow can also be started manually from the Actions tab.
- The deployed artifact is prepared via `npm run build:pages`.

### Create a Release from the Terminal

```bash
npm run build:release
npm run build:release -- v1.0.0
```

- `build:release` builds the GitHub Pages artifact, pushes the current branch, and creates a GitHub Release.
- The self-contained HTML file is attached to the release automatically.
- This requires the official GitHub CLI and a login via `gh auth login`.

---

## Testing

See [docs/testing-guide.md](docs/testing-guide.md) for a full walkthrough. Quick reference:

```bash
# Unit tests (Vitest)
npm run test                          # watch mode
npm run test:unit                     # all unit tests (fast)
npm run test:integration              # cross-module integration tests
npm run test:regression               # core regression suite
npm run test:inspector-layout         # inspector + layout combined suite
npm run test:ui                       # Vitest browser UI

# End-to-end tests (Playwright)
npm run test:e2e                      # full E2E suite (all specs)
npm run test:e2e:ui                   # Playwright interactive UI mode
npm run test:e2e:update-snapshots     # regenerate visual snapshots
npm run test:builder-workflow         # CSV roundtrip + undo/redo + exports

# CSV roundtrip E2E (dataset variants)
npm run test:e2e:csv                  # large dataset (default)
npm run test:e2e:csv:minimal          # minimal dataset
npm run test:e2e:csv:small            # small dataset
npm run test:e2e:csv:medium           # medium dataset
npm run test:e2e:csv:large            # large dataset
npm run test:e2e:csv:custom           # custom CSV (set SKILLTREE_E2E_TEMPLATE_CSV)

# Layout regression baseline
npm run test:e2e:layout:baseline

npm run lint                          # ESLint
```

---

## E2E Dataset & Phase Selection

CSV E2E tests support built-in datasets and a custom file path.

```bash
# Run only specific phases against the medium dataset
SKILLTREE_E2E_DATASET=medium \
SKILLTREE_E2E_PHASES=statuses,scopes \
npm run test:e2e:csv

# Custom CSV file
SKILLTREE_E2E_DATASET=custom \
SKILLTREE_E2E_TEMPLATE_CSV="tests/e2e/datasets/large.csv" \
npm run test:e2e:csv:custom
```

Available `SKILLTREE_E2E_PHASES` values (comma-separated, default `all`):

| Phase | What it tests |
|---|---|
| `statuses` | Node status round-trip per CSV row |
| `scopes` | Scope tag assignment |
| `segments` | Segment assignment |
| `roundtrip` | Full export → re-import data equivalence |
| `all` | All phases |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SKILLTREE_E2E_DATASET` | `large` | Built-in dataset: `minimal`, `small`, `medium`, `large`, `custom` |
| `SKILLTREE_E2E_TEMPLATE_CSV` | — | Absolute or relative path to a custom CSV (requires `DATASET=custom`) |
| `SKILLTREE_E2E_PHASES` | `all` | Comma-separated phases to run in the CSV roundtrip spec |
| `SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS` | `0` | Set to `1` to skip progress-level assertions |
| `SKILLTREE_E2E_IGNORE_SEGMENTS` | `0` | Set to `1` to skip segment assertions |
| `SKILLTREE_E2E_VERBOSE` | `0` | Set to `1` for verbose per-row logging |
| `SKILLTREE_TEST_RUN_LABEL` | `e2e` | Human-readable label embedded in artifact paths |
| `SKILLTREE_TEST_RUN_ID` | auto | Explicit run ID (`YYMMDDHHNN_<label>`) |
| `SKILLTREE_TEST_ARTIFACTS_DIR` | `tests/results` | Root directory for all test artifacts |

All Playwright traces, screenshots, exports, and metrics land in `tests/results/runs/<run-id>/`.

---

## Configuration

Layout and visual behaviour is controlled by `TREE_CONFIG` in [src/components/config.js](src/components/config.js):

| Parameter | Default | Description |
|---|---|---|
| `nodeSize` | `120 px` | Rendered node diameter |
| `levelSpacing` | `180 px` | Radial distance between consecutive rings |
| `maxAngleSpread` | `270°` | Maximum arc occupied by all nodes combined |
| `minArcGapFactor` | `1.08` | Minimum gap between siblings as a multiple of `nodeSize` |
| `routingProfile` | `'strict'` | Edge trunk-sharing threshold (`balanced` / `strict`) |
| `promotionProfile` | `'balanced'` | Auto-promotion aggressiveness |
| `separatorHomogeneityProfile` | `'balanced'` | Separator detour consistency (`off` / `balanced` / `strong`) |
| `horizontalPadding` | `600 px` | Canvas left/right padding |
| `topPadding` / `bottomPadding` | `600 px` | Canvas top/bottom padding |

---

## Architecture Overview

See [docs/architecture.md](docs/architecture.md) for a detailed breakdown. In brief:

### Multi-Phase Layout Solving
1. **Segment Optimization** — greedy angular ordering with swap refinement
2. **Level Assignment (Phase 1)** — auto-promotion resolves angular conflicts
3. **Pass 1** — initial position computation + crossing detection
4. **Phase 2 / 3 / 4** — crossing-promotion, compaction, subtree re-rooting
5. **Pass 2** — re-layout with adjusted levels (only if phases 2–4 fired)
6. **Rendering** — convert polar coordinates to SVG x/y

### Validation
Only constraints *newly introduced* by a change block the mutation. Pre-existing issues are surfaced as informational diagnostics and never prevent valid edits.

### Document Persistence
The document is serialized as JSON (schema v3) to `localStorage` under the key `roadmap-skilltree.document.v1`. Automatic migration handles v1 → v2 → v3 on load.

---

## Further Reading

| Document | Description |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Component tree, data flow, module responsibilities |
| [docs/data-model.md](docs/data-model.md) | Document schema, node/level/segment/release shapes |
| [docs/csv-format.md](docs/csv-format.md) | CSV import/export column reference |
| [docs/testing-guide.md](docs/testing-guide.md) | All test types, commands, fixtures, and CI notes |
| [docs/layout-and-routing-algorithms.md](docs/layout-and-routing-algorithms.md) | In-depth layout algorithm documentation |
Diff Issues (baseline vs candidate)
