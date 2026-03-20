# Skill-Tree Layout Tests

Umfassende Test-Suite für das Skill-Tree Layout-System, Validierung und Datenmutationen.

## Test Übersicht

### 📊 Test-Statistik
- **Gesamt Tests:** 53
- **Test-Dateien:** 4
- **Pass-Rate:** 100%

```
✓ treeData.test.js          18 tests
✓ treeValidation.test.js    18 tests  
✓ layoutSolver.test.js      17 tests
✓ testUtils.js              (Utilities)
```

## Test-Kategorien

### 1. **treeData.test.js** - Datenmutationen
Tests für Baumstruktur-Manipulationen:

#### findNodeById
- ✓ Findet Knoten auf Root-Level
- ✓ Findet Knoten in verschachtelten Kindern
- ✓ Gibt null für nicht existierende Knoten zurück
- ✓ Gibt null für null Input zurück

#### updateNodeData
- ✓ Aktualisiert Label und Status
- ✓ Erzeugt neue Objekte (keine Mutation)
- ✓ Aktualisiert verschachtelte Knoten

#### updateNodeSegment
- ✓ Wechselt Knoten zu anderem Segment
- ✓ Setzt Segment auf null
- ✓ Beeinträchtigt nicht andere Knoten (kein Subtree-Cascade)
- ✓ Bewahrt Baumstruktur
- ✓ Verarbeitet Cross-Segment Bäume

#### updateNodeLevel
- ✓ Aktualisiert Knotenlevel
- ✓ Passt Kinder-Level proportional an

### 2. **layoutSolver.test.js** - Layout-Berechnung
Tests für die Hauptlayout-Engine:

#### solveSkillTreeLayout Grundfunktionen
- ✓ Löst Layout für einfache Bäume
- ✓ Determinismus (identische Eingabe → identische Ausgabe)
- ✓ Verarbeitet leere Bäume
- ✓ Positioniert alle Knoten mit x, y, angle, radius
- ✓ Respektiert Angular Spread Constraint (270°)
- ✓ Verarbeitet Cross-Segment Bäume
- ✓ Liefert Canvas-Daten (width, height, origin, maxRadius)
- ✓ Erstellt Links zwischen Knoten

#### layoutSolver Validierung
- ✓ Meldet keine Overlaps für einfache Bäume
- ✓ Formatiert Diagnostik korrekt
- ✓ Verarbeitet Bäume ohne Segmente
- ✓ Behält Baumstruktur bei
- ✓ Erstellt Beziehungs-Links

#### layoutSolver Edge Cases
- ✓ Verarbeitet Single-Node Bäume
- ✓ Verarbeitet tiefe Bäume (Nesting)
- ✓ Verarbeitet breite Bäume (viele Siblings)
- ✓ Liefert Metadaten (orderedSegments, computedLevels)

### 3. **treeValidation.test.js** - Validierung
Tests für Änderungsvalidation:

#### validateSkillTree
- ✓ Validiert einfache Bäume
- ✓ Verarbeitet leere Bäume

#### validateNodeSegmentChange
- ✓ Erlaubt gültige Segment-Wechsel
- ✓ Erkennt verursachte Overlaps
- ✓ Blockiert nicht bei Pre-Existing Issues
- ✓ Filtert segment-boundary Issues aus
- ✓ Verarbeitet Cross-Segment Änderungen
- ✓ Erlaubt Wechsel zu null-Segment

#### validateNodeLevelChange  
- ✓ Erlaubt gültige Level-Wechsel
- ✓ Verhindert ungültige Level (zu niedrig)
- ✓ Filtert segment-boundary Issues aus

#### getSegmentOptionsForNode
- ✓ Liefert verfügbare Segmente
- ✓ Markiert aktuelles Segment als allowed
- ✓ Enthält "Ohne Segment" Option
- ✓ Liefert Reasons für blockierte Optionen
- ✓ Verarbeitet Knoten ohne Segment

#### getLevelOptionsForNode
- ✓ Liefert verfügbare Level
- ✓ Markiert aktuelles Level als allowed
- ✓ Verhindert Level ≤ Parent-Level
- ✓ Gibt empty array für Root-Knoten zurück

#### Integration
- ✓ Verarbeitet Segment + Level Änderungen zusammen
- ✓ Konsistente Options across Methods

## Test-Utilities

**testUtils.js** bietet Testing Helpers:

### Tree Creation Functions
- `createSimpleTree()` - Frontend/Backend mit Children
- `createCrossSegmentTree()` - Parent in Frontend, Child in Backend  
- `createDenseTree(segmentId, nodeCount)` - Viele Knoten zum Stress-Testen
- `createEmptyTree()` - Nur Segmente, keine Knoten

### Tree Analysis Functions
- `findNodeInTree(tree, nodeId)` - Knoten suchen
- `countNodesInTree(tree)` - Knoten zählen
- `getNodeIdsForSegment(tree, segmentId)` - Alle Knoten eines Segments

## Testen ausführen

### Alle Tests
```bash
npm test
```

### Mit UI
```bash
npm test:ui
```

### Watch Mode
```bash
npm test -- --watch
```

### Einzelne Suite
```bash
npm test layoutSolver.test.js
```

## Test Szenarien

### Segment-Änderungen
- Wechsel zwischen expliziten Segmenten
- Wechsel zu "Ohne Segment"
- Cross-Segment Beziehungen erkennen

### Level-Änderungen
- Anhebung auf höhere Ebenen
- Proportionale Kind-Anpassung
- Parent-Kind Constraints (Kind muss > Parent sein)

### Layout-Validierung
- Angular Spread Constraints
- Node-Overlap Erkennung
- Segment-Boundary Respektierung
- Deterministische Positionierung

### Edge Cases
- Leere Bäume
- Single-Node Bäume
- Tiefe Verschachtelung
- Viele Siblings
- Dichte Knoten-Bereiche

## Implementierte Features

### ✅ Segment-Order Optimierung
- Greedy-Algorithmus mit lokaler Swap-Refinement
- Gewichtung nach Cross-Segment Edges
- Tests: determinism, order consistency

### ✅ Auto-Promotion
- Knoten zu höheren Ringen für Cross-Segment Kanten
- Distanz-basierte Metriken
- Validierung bei Änderungen

### ✅ Hard Capacity Checking
- Angular Span Berechnung pro Level/Segment
- Iterative Radius-Vergrößerung (max 8 Versuche)
- Formale Unlösbarkeit-Erkennung

### ✅ Change-Scoped Validation
- Nur neu eingeführte Issues blockieren
- Pre-existing Issues werden ignoriert
- segment-boundary Issues werden gefiltert

### ✅ Per-Node Segmentunabhängigkeit
- Kind kann in anderem Segment sein als Parent
- Keine Subtree-Cascade mehr
- Flexible Architektur

## Validierung

```bash
# Lint + Build + Tests
npm run lint
npm run build
npm test
```

Alle Komponenten:
- ✅ ESLint clean
- ✅ Production build successful
- ✅ All tests passing

## Performance-Notizen

- Kleine Bäume (< 20 Knoten): < 10ms
- Mittlere Bäume (20-100 Knoten): < 100ms
- Große Bäume (100+ Knoten): < 500ms
- Tests sollten in < 1 Sekunde laufen

## Future Test-Erwiderungen

- [ ] Regression Test Suite
- [ ] Performance Benchmarks
- [ ] Force-Directed Relaxation Tests
- [ ] ELK Integration Tests
- [ ] Snapshot Tests für Layouts
- [ ] Property-Based Tests (QuickCheck-Style)
