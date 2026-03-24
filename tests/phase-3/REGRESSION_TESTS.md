# Phase 3 — Regression Tests

Phase 3 locks down the refactored core with fast regression coverage before any remaining E2E work.

Included suites:

- `components/skill-tree/__tests__/layoutSolver.test.js`
- `components/skill-tree/__tests__/treeValidation.test.js`
- `components/skill-tree/__tests__/treeData.test.js`
- `components/skill-tree/__tests__/documentState.test.js`
- `components/skill-tree/__tests__/documentPersistence.test.js`
- `components/skill-tree/__tests__/htmlExport.test.js`
- `components/skill-tree/__tests__/pdfExport.test.js`
- `components/skill-tree/__tests__/svgExport.test.js`
- `components/skill-tree/__tests__/nodeSegmentAssignment.test.js`
- `components/skill-tree/__tests__/segmentSlots.test.js`
- `components/skill-tree/__tests__/segmentCRUD.test.js`
- `components/skill-tree/__tests__/segmentIntegration.test.js`
- `components/skill-tree/__tests__/multiselect.test.js`
- `components/skill-tree/__tests__/keyboardShortcuts.test.js`
- `components/skill-tree/__tests__/panelsState.test.js`
- `components/skill-tree/__tests__/inspector.test.js`
- `components/skill-tree/__tests__/phase3Regression.test.js`

Local run:

```bash
npm run test:phase3
```
