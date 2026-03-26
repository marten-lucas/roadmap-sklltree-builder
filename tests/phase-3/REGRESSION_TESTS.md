# Inspector and Layout Regression Tests

This suite locks down the refactored core with fast regression coverage before any remaining E2E work.

Included suites:

- `src/components/skill-tree/__tests__/layoutSolver.test.js`
- `src/components/skill-tree/__tests__/treeValidation.test.js`
- `src/components/skill-tree/__tests__/treeData.test.js`
- `src/components/skill-tree/__tests__/documentState.test.js`
- `src/components/skill-tree/__tests__/documentPersistence.test.js`
- `src/components/skill-tree/__tests__/htmlExport.test.js`
- `src/components/skill-tree/__tests__/pdfExport.test.js`
- `src/components/skill-tree/__tests__/svgExport.test.js`
- `src/components/skill-tree/__tests__/nodeSegmentAssignment.test.js`
- `src/components/skill-tree/__tests__/segmentSlots.test.js`
- `src/components/skill-tree/__tests__/segmentCRUD.test.js`
- `src/components/skill-tree/__tests__/segmentIntegration.test.js`
- `src/components/skill-tree/__tests__/multiselect.test.js`
- `src/components/skill-tree/__tests__/keyboardShortcuts.test.js`
- `src/components/skill-tree/__tests__/panelsState.test.js`
- `src/components/skill-tree/__tests__/inspector.test.js`
- `src/components/skill-tree/__tests__/phase3Regression.test.js`

Local run:

```bash
npm run test:inspector-layout
```
