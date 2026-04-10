# Testing Guide

This project has three layers of tests: **unit tests** (Vitest), **integration tests** (Vitest, cross-module), and **end-to-end tests** (Playwright). All test output and artifacts are written to `tests/results/`.

---

## Table of Contents

- [Quick Reference](#quick-reference)
- [Unit Tests (Vitest)](#unit-tests-vitest)
  - [Running Unit Tests](#running-unit-tests)
  - [Unit Test Files](#unit-test-files)
  - [Test Utilities & Fixtures](#test-utilities--fixtures)
- [Integration Tests (Vitest)](#integration-tests-vitest)
- [Regression Suites](#regression-suites)
- [End-to-End Tests (Playwright)](#end-to-end-tests-playwright)
  - [Prerequisites](#prerequisites)
  - [Running E2E Tests](#running-e2e-tests)
  - [E2E Spec Files](#e2e-spec-files)
  - [CSV Roundtrip Tests](#csv-roundtrip-tests)
  - [Visual Snapshot Tests](#visual-snapshot-tests)
  - [Layout Regression Tests](#layout-regression-tests)
- [Environment Variables](#environment-variables)
- [Test Artifacts](#test-artifacts)
- [CI Notes](#ci-notes)

---

## Quick Reference

```bash
# Unit (Vitest)
npm run test                         # watch mode (all vitest tests)
npm run test:unit                    # run unit tests once
npm run test:integration             # integration tests
npm run test:regression              # core regression suite
npm run test:inspector-layout        # inspector + layout suite (core + integration)
npm run test:ui                      # Vitest browser UI

# E2E (Playwright)
npm run test:e2e                     # full E2E suite
npm run test:e2e:ui                  # Playwright interactive UI
npm run test:e2e:update-snapshots    # regenerate visual snapshots
npm run test:builder-workflow        # focused builder workflow suite

# CSV roundtrip E2E
npm run test:e2e:csv                 # large dataset
npm run test:e2e:csv:minimal
npm run test:e2e:csv:small
npm run test:e2e:csv:medium
npm run test:e2e:csv:large
npm run test:e2e:csv:custom          # set SKILLTREE_E2E_TEMPLATE_CSV first

# Layout regression baseline
npm run test:e2e:layout:baseline

npm run lint                         # ESLint
```

---

## Unit Tests (Vitest)

Unit tests live in `src/components/__tests__/`. They run in a Node.js environment (no DOM, no browser) via **Vitest**. The `vitest.config.js` excludes the `tests/e2e/` directory.

### Running Unit Tests

```bash
npm run test:unit
```

This runs all test files in `src/components/__tests__/` **except** `segmentIntegration.test.js` and `multiselect.test.js` (those are integration tests).

To run a single file:
```bash
npx vitest run src/components/__tests__/layoutSolver.test.js
```

To run in watch mode (reruns on save):
```bash
npm run test              # or: npx vitest
```

To open the Vitest browser UI:
```bash
npm run test:ui
```

### Unit Test Files

| File | What it tests |
|---|---|
| `layoutSolver.test.js` | Core layout engine — determinism, node placement, angular constraints, segment ordering |
| `treeData.test.js` | Tree mutations — add/delete/move node, level management, immutability |
| `treeValidation.test.js` | Constraint checking — change-scoped validation, segment/level conflict detection |
| `documentState.test.js` | Document normalization, `createEmptyDocument()`, default migrations |
| `documentPersistence.test.js` | localStorage serialize/deserialize, schema migrations v1→v2→v3 |
| `csv.test.js` | CSV parsing, header aliases, status normalization, empty/blank cells |
| `csvEffortBenefit.test.js` | Effort and Benefit columns in CSV import/export |
| `htmlExport.test.js` | HTML export payload structure, scope canonicalization, data injection |
| `svgExport.test.js` | SVG serialization, inline style injection, foreignObject handling |
| `pdfExport.test.js` | Release note markdown rendering for PDF |
| `effortBenefit.test.js` | Effort/Benefit size normalization, story-point map |
| `edgeCrossings.test.js` | Radial polyline crossing detection geometry |
| `nodeSegmentAssignment.test.js` | Segment assignment logic per node |
| `segmentSlots.test.js` | Segment slot allocation and capacity |
| `phase3Regression.test.js` | Regression cases for Phase 3 layout fixes |
| `hiddenNodes.test.js` | Hidden-node visibility filtering |
| `visibility.test.js` | `isNodeVisible()` with various flag combinations |
| `viewport.test.js` | Viewport pan/zoom state helpers |
| `skillTreeCanvas.test.js` | Canvas rendering helpers |
| `scopeDisplay.test.js` | Scope-label badge markup rendering |
| `nodeLabelMode.test.js` | Short-name vs full label display logic |
| `panelsState.test.js` | Panel open/close state transitions |
| `inspector.test.js` | Inspector field commit helpers |
| `keyboardShortcuts.test.js` | Keyboard shortcut registration and dispatch |
| `priorityMatrix.test.js` | Priority matrix (effort × benefit) layout computation |
| `gapDiagnostic.test.js` | Gap diagnostic helpers for layout diagnostics |
| `alignDiag.test.js` | Angular alignment diagnostics |
| `layoutBenchmark.test.js` | Performance benchmarks (not blocking, for reference) |
| `releaseNoteDraft.test.js` | Auto-generated release note draft content |
| `analyze_kyana.test.js` | Analysis helpers against a real-world CSV fixture |

### Test Utilities & Fixtures

`src/components/__tests__/testUtils.js` provides:

| Export | Description |
|---|---|
| `createSimpleTree()` | 2-segment tree with 4 leaf nodes |
| `createCrossSegmentTree()` | Tree where child nodes cross segment boundaries |
| `createDenseTree()` | High-density tree to test capacity limits |
| `createEmptyTree()` | Tree with segments but no nodes |
| `countNodesInTree(tree)` | Counts all nodes recursively |
| `LEVEL_ROOT_*` / `LEVEL_CHILD_*` | Stable level IDs for assertion |

---

## Integration Tests (Vitest)

```bash
npm run test:integration
```

Runs `segmentIntegration.test.js` and `multiselect.test.js`. These tests exercise multiple modules together (e.g., segment CRUD at the document level, multi-select operations across nodes).

```bash
npm run test:inspector-layout:integration
```

Runs the broader inspector + layout integration group:
- `segmentCRUD.test.js`
- `segmentIntegration.test.js`
- `multiselect.test.js`
- `keyboardShortcuts.test.js`
- `panelsState.test.js`
- `inspector.test.js`

---

## Regression Suites

```bash
npm run test:regression
```

Runs the core regression suite covering the most critical modules:

- `layoutSolver.test.js`
- `treeValidation.test.js`
- `treeData.test.js`
- `documentState.test.js`
- `documentPersistence.test.js`
- `htmlExport.test.js`
- `pdfExport.test.js`
- `svgExport.test.js`
- `nodeSegmentAssignment.test.js`
- `segmentSlots.test.js`

```bash
npm run test:inspector-layout
```

Alias for running both `test:inspector-layout:core` and `test:inspector-layout:integration` in sequence. Use this to verify layout and inspector changes do not regress.

---

## End-to-End Tests (Playwright)

E2E tests use **Playwright** and run against the live Vite dev server (`http://localhost:5173`). The Playwright config is in `playwright.config.js`.

### Prerequisites

The dev server must be running before E2E tests start:

```bash
npm run dev          # terminal 1
npm run test:e2e     # terminal 2
```

Playwright's `webServer` config handles this automatically: if the server is not already running, Playwright will start it.

Ensure Playwright browsers are installed:
```bash
npx playwright install
```

### Running E2E Tests

```bash
npm run test:e2e                    # headless, all specs, chromium + firefox + webkit
npm run test:e2e:ui                 # interactive Playwright UI mode
npm run test:e2e:update-snapshots   # regenerate toolbar/node visual snapshots
```

### E2E Spec Files

`tests/e2e/`

| Spec | What it tests |
|---|---|
| `app-smoke.spec.js` | App loads without JS errors; canvas and toolbar are visible |
| `exports.spec.js` | HTML export content matches builder state; node labels preserved |
| `undoRedo.spec.js` | Undo/redo stack — add node, undo, verify removed, redo, verify restored |
| `segment-toolbar.spec.js` | Add/rename/delete segments from the toolbar |
| `csv-toolbar.spec.js` | Import CSV via toolbar button; verify nodes appear |
| `csv-import-export-roundtrip.spec.js` | Full CSV import → edit → export → re-import equivalence (see below) |
| `iterative-csv-import.spec.js` | Repeated CSV imports do not corrupt state |
| `capture-full-import.spec.js` | Screenshot capture after full CSV import |
| `multiselect-regression.spec.js` | Multi-select: bulk status change, deselect |
| `viewport-keyboard-and-fit.spec.js` | Keyboard shortcuts for pan/zoom/fit; fit-to-screen calculation |
| `layout-regression.spec.js` | Layout determinism regression against a saved baseline metric |
| `phase3-regressions.spec.js` | Phase 3 layout edge cases (portal, compaction, re-rooting) |
| `toolbar-rendered.spec.js` | Visual snapshot of toolbar (pixel-level regression) |
| `export-rendered.spec.js` | Visual snapshot of exported HTML viewer |
| `node-veryclose-glow.spec.js` | Visual snapshot of close-proximity node glow |
| `dump-model-trace.spec.js` | Dumps model trace for debugging; not a pass/fail assertion spec |
| `trace-cod.spec.js` | Traces a specific CoD (cost-of-delay) scenario |

### CSV Roundtrip Tests

The CSV roundtrip suite (`csv-import-export-roundtrip.spec.js`) is the most comprehensive E2E suite. It:

1. Imports a CSV template row-by-row, simulating a real user building a tree
2. After each row (or set of rows), asserts that the UI reflects the expected data
3. Exports the tree back to CSV
4. Re-imports the export and asserts data equivalence

#### Datasets

Located in `tests/e2e/datasets/`:

| File | Size |
|---|---|
| `minimal.csv` | ~5 nodes — fast smoke check |
| `small.csv` | ~20 nodes |
| `medium.csv` | ~50 nodes |
| `large.csv` | ~150 nodes |
| `huge.csv` | ~300+ nodes — stress test |

#### Running With a Specific Dataset

```bash
npm run test:e2e:csv:small
npm run test:e2e:csv:medium
npm run test:e2e:csv:large
```

#### Phases

The roundtrip spec is divided into phases. You can run only specific phases:

```bash
SKILLTREE_E2E_PHASES=statuses,roundtrip npm run test:e2e:csv
```

| Phase | Description |
|---|---|
| `statuses` | Assert each node's status after import |
| `scopes` | Assert scope tag assignments |
| `segments` | Assert segment assignments |
| `roundtrip` | Export → re-import data equivalence check |
| `all` | All four phases (default) |

#### Custom CSV

```bash
SKILLTREE_E2E_DATASET=custom \
SKILLTREE_E2E_TEMPLATE_CSV="path/to/my.csv" \
npm run test:e2e:csv:custom
```

#### Skip Flags

These flags are set by default in the npm scripts:

| Flag | Effect |
|---|---|
| `SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS=1` | Skip assertions on progress-level (ProgressLevel column) |
| `SKILLTREE_E2E_IGNORE_SEGMENTS=1` | Skip assertions on segment assignment |

### Visual Snapshot Tests

`toolbar-rendered.spec.js` and `node-veryclose-glow.spec.js` use Playwright screenshot comparison against snapshots stored in:
- `tests/e2e/toolbar-rendered.spec.js-snapshots/`
- `tests/e2e/node-veryclose-glow.spec.js-snapshots/`

To update snapshots after intentional visual changes:
```bash
npm run test:e2e:update-snapshots
```

### Layout Regression Tests

`layout-regression.spec.js` captures layout metrics (node positions, link counts, segment spans) and compares them against a saved baseline in `tests/e2e/datasets/layout-regression/`.

To regenerate the baseline:
```bash
npm run test:e2e:layout:baseline
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SKILLTREE_E2E_DATASET` | `large` | CSV dataset: `minimal`, `small`, `medium`, `large`, `custom` |
| `SKILLTREE_E2E_TEMPLATE_CSV` | — | Path to custom CSV file (used when `DATASET=custom`) |
| `SKILLTREE_E2E_PHASES` | `all` | Comma-separated phases: `statuses`, `scopes`, `segments`, `roundtrip`, `all` |
| `SKILLTREE_E2E_IGNORE_PROGRESS_LEVELS` | `0` | Set to `1` to skip ProgressLevel assertions |
| `SKILLTREE_E2E_IGNORE_SEGMENTS` | `0` | Set to `1` to skip segment assertions |
| `SKILLTREE_E2E_VERBOSE` | `0` | Set to `1` for verbose per-row logging |
| `SKILLTREE_TEST_RUN_LABEL` | `e2e` | Label embedded in artifact folder name |
| `SKILLTREE_TEST_RUN_ID` | `YYMMDDHHNN_<label>` | Explicit run ID (auto-generated if not set) |
| `SKILLTREE_TEST_ARTIFACTS_DIR` | `tests/results` | Root directory for all test artifacts |

---

## Test Artifacts

All Playwright artifacts are written under:

```
tests/results/runs/<run-id>/
├── playwright/          # Playwright trace files, videos, screenshots
├── reports/
│   └── playwright-results.json
├── e2e-exports/         # Files downloaded during E2E tests (HTML, SVG, CSV)
└── e2e-metrics/         # Layout metric JSON files
```

The `tests/results/` directory is excluded from git.

---

## CI Notes

- `playwright.config.js` sets `forbidOnly: !!process.env.CI` — `test.only()` calls fail the CI run.
- `retries` is `1` on CI, `0` locally.
- The Playwright `webServer` block starts `npm run dev` automatically if not already running on port 5173.
- For CI, install browsers with: `npx playwright install --with-deps`
- Set `SKILLTREE_TEST_ARTIFACTS_DIR` to a path writable by the CI agent if the default `tests/results/` is not suitable.
