# Phase 2 — Core Tests Manifest

This document lists the core tests that form the Phase‑2 minimal E2E surface.

Purpose:
- Provide a small, high-signal regression suite for critical flows.
- Run locally via `npm run test:phase2` or in CI via the Phase‑2 workflow.

Core specs included:

- `tests/e2e/csv-import-export-roundtrip.spec.js` — CSV-driven import/export roundtrip regression (preserves structure, statuses, scopes, segments).
- `tests/e2e/undoRedo.spec.js` — Undo/Redo invariants for typical critical mutations and keyboard shortcuts.
- `tests/e2e/segment-toolbar.spec.js` — Segment create/edit/delete flows and toolbar interactions.
- `tests/e2e/exports.spec.js` — HTML/SVG export invariants and artifact correctness.

How to run locally:

```bash
npm install
npm run test:phase2
```

Artifacts are written into `tests/results/` by default.
