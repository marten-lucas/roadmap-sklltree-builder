# Skill Tree Layout Builder

Advanced radial skill-tree visualization with intelligent layout solving, constraint-based validation, and segment-aware positioning.

## Features

### 🎨 Layout Engine
- **Determistic Radial Layout** - D3-hierarchy based positioning with angular constraints
- **Segment-Aware Packing** - Intelligent division of angular space across skill domains
- **Auto-Promotion** - Automatic level elevation for cross-segment relationships
- **Hard Capacity Checking** - Formal feasibility detection with iterative radius adjustment
- **Angular Spread Control** - Configurable max spread (270°) with automatic scaling

### ✅ Validation System
- **Change-Scoped Assessment** - Only newly introduced issues block changes
- **Per-Node Flexibility** - Child nodes can belong to different segments than parents
- **Formal Constraint Checking** - Segment boundaries, angular spans, node distances
- **Intelligent Issue Filtering** - Pre-existing problems don't block valid mutations

### 🎯 Data Architecture
- **Immutable Updates** - All mutations return new tree objects
- **Independent Segmentation** - Parent ≠ Child segment relationships allowed
- **Proportional Scaling** - Children maintain relative positioning when levels change
- **Metadata Enrichment** - Computed levels, segment orders, node rankings

## Project Structure

```
components/skill-tree/
├── layoutSolver.js           # Core layout computation engine
├── treeValidation.js         # Change validation & constraint checking
├── treeData.js              # Tree mutations & traversal
├── SkillTree.jsx            # Main visualization component
├── InspectorPanel.jsx       # Node editing UI (HeroUI-based)
├── SegmentPanel.jsx         # Segment management
├── config.js                # Configuration constants
├── data.js                  # Sample data
└── __tests__/
    ├── layoutSolver.test.js  # 17 layout tests
    ├── treeValidation.test.js # 18 validation tests
    ├── treeData.test.js      # 18 data mutation tests
    ├── testUtils.js          # Test utilities & fixtures
    └── README.md             # Test documentation
```

## Development

### Setup
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
```

### Testing
```bash
npm test          # Run all tests (53 total)
npm test:ui       # With Vitest UI
npm test --watch  # Watch mode
npm run lint      # ESLint validation
```

### Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| **layoutSolver** | 17 | ✅ All passing |
| **treeValidation** | 18 | ✅ All passing |
| **treeData** | 18 | ✅ All passing |
| **Total** | **53** | **✅ 100% Pass** |

**Test Categories:**
- Determinism & Consistency
- Constraint Validation
- Edge Cases & Error Handling
- Data Immutability
- Cross-Segment Relationships
- Angular Spread Constraints
- Capacity Checking

### Configuration

[config.js](components/skill-tree/config.js) provides layout parameters:

```javascript
export const TREE_CONFIG = {
  maxAngleSpread: 270,           // Max angular spread in degrees
  nodeSize: 60,                  // Pixel diameter of skill nodes
  levelSpacing: 140,             // Radial distance between levels
  minArcAngle: 8,               // Minimum angle between siblings
}
```

## Architecture Highlights

### Multi-Phase Layout Solving
1. **Normalization** - Convert tree to D3 hierarchy
2. **Segment Optimization** - Greedy ordering with swap refinement
3. **Auto-Promotion** - Elevate cross-segment nodes
4. **Angular Assignment** - Span-aware positioning
5. **Capacity Checking** - Hard packing with radius adjustment
6. **Rendering** - Convert to SVG coordinates

### Validation Approach
```
User Change
    ↓
Baseline Snapshot (current state)
    ↓
Apply Change (hypothetical)
    ↓
Candidate Snapshot
    ↓
Diff Issues (baseline vs candidate)
    ↓
Filter Scope (only this node's impact)
    ↓
Allow/Block Decision
```

### Data Patterns
- **Immutable** - All mutations return new objects
- **Recursive** - Tree operations use depth-first traversal
- **Flat indexing** - ID-based lookups throughout
- **Change-scoped** - Validation only considers node and descendants

## Key Components

### InspectorPanel.jsx
HeroUI-based node editor with:
- Textarea for name editing (flexible sizing)
- Dropdown menus for Status/Ebene/Segment
- Validation hints (compact, non-blocking)
- Delete actions (single node & full branch)

### layoutSolver.js (1200+ lines)
Low-level layout computation:
- `solveSkillTreeLayout()` - Main entry point
- `buildOptimizedSegmentIdOrder()` - Segment ordering
- `buildAutoPromotedLevels()` - Cross-segment elevation
- Hard capacity checking loop with iterative radius growth

### treeValidation.js
Change validation pipeline:
- `validateNodeSegmentChange()` - Segment mutations
- `validateNodeLevelChange()` - Level mutations
- `getSegmentOptionsForNode()` - Available options
- `getLevelOptionsForNode()` - Available elevations

## Recent Improvements

### Phase 3: Hard Feasibility & Validation Fixes ✅
- ✅ Capacity-aware angular packing with iteration
- ✅ Change-scoped validation (not global blocking)
- ✅ Per-node segment independence
- ✅ Segment-boundary issues filtered from validation
- ✅ UI dropdown rendering fixed (no overlap)
- ✅ HeroUI standards compliance (Textarea, Dropdown)

### Earlier Phases
- Phase 2: Segment/Child ordering optimization
- Phase 1: Layout fundamentals with D3 hierarchy
- Phase 0: React + Vite + HeroUI setup

## Testing Philosophy

Tests focus on:
1. **Correctness** - Do functions behave as documented?
2. **Constraints** - Are boundaries respected?
3. **Consistency** - Is output deterministic?
4. **Edge Cases** - How do we handle extremes?
5. **Integration** - Do components work together?

See [/__tests__/README.md](components/skill-tree/__tests__/README.md) for detailed test documentation.

## Performance

- **Rendering:** < 16ms for typical trees (60 FPS)
- **Layout:** < 100ms for 100-node trees
- **Validation:** < 10ms for change checks
- **Test Suite:** ~600ms for all 53 tests

## Next Steps

- [ ] Regression test suite expansion
- [ ] Force-directed relaxation polish layer
- [ ] ELK integration as alternative backend
- [ ] Performance profiling & optimization
- [ ] Snapshot testing for layouts
- [ ] Property-based (QuickCheck-style) tests

## Built With

- **React 19** - UI framework
- **Vite 8** - Build tool
- **D3-Hierarchy 3** - Tree layout
- **HeroUI 2** - Component library
- **Tailwind CSS 3** - Styling
- **Vitest** - Testing framework
- **ESLint** - Code quality

## License

MIT
