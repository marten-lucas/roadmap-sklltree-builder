# Data Model Reference

This document describes the complete JSON data model used by the Skill Tree Builder, including the document schema, all entity shapes, and enum values.

---

## Table of Contents

- [Document Schema Version](#document-schema-version)
- [Document](#document)
- [Node](#node)
- [Level](#level)
- [Segment](#segment)
- [Scope](#scope)
- [Release](#release)
- [Effort](#effort)
- [Benefit](#benefit)
- [Status Keys](#status-keys)
- [Story Point Map](#story-point-map)
- [Serialized Payload (localStorage / HTML export)](#serialized-payload-localstorage--html-export)

---

## Document Schema Version

Current schema version: **3**

Migration history:

| Version | Change |
|---|---|
| v1 | `node.additionalDependencyIds = [nodeId]` (node-level dependency tracking) |
| v2 | `level.additionalDependencyLevelIds = [levelId]` (per-level dependencies) |
| v3 | `level.statuses = { [releaseId]: string }` (per-release status per level) |

On load, `documentPersistence.parseDocumentPayload()` migrates v1 → v2 → v3 automatically.

---

## Document

The top-level object that represents the entire skill tree.

```ts
interface Document {
  segments:       Segment[]         // ordered list of topic segments
  children:       Node[]            // root-level nodes (max recommended: ~8)
  scopes:         Scope[]           // scope tags available for assignment
  releases:       Release[]         // release milestones (at least 1)
  centerIconSrc:  string            // data URI or URL for the center icon SVG
  storyPointMap:  StoryPointMap     // mapping of size keys to story-point values
  showHiddenNodes: boolean          // whether hidden nodes are shown in the builder
}
```

### Defaults (createEmptyDocument)

```json
{
  "segments": [],
  "scopes": [],
  "children": [],
  "centerIconSrc": "data:image/svg+xml;…",
  "releases": [{ "id": "…", "name": "Release 1", … }],
  "storyPointMap": { "xs": 1, "s": 3, "m": 5, "l": 8, "xl": 13 },
  "showHiddenNodes": false
}
```

---

## Node

A single skill or topic in the tree. Nodes form a recursive hierarchy through `children`.

```ts
interface Node {
  id:         string      // UUID — stable across edits
  label:      string      // full display name
  shortName:  string      // 1–3 character abbreviation (shown in tree)
  segmentId:  string      // ID of the node's assigned segment
  ebene:      number|null // explicit level override (null = use tree depth)
  levels:     Level[]     // ordered list of progress levels (at least 1)
  children:   Node[]      // child nodes in the tree hierarchy
}
```

> A node's effective layout level is computed by the layout solver from `ebene`, `tree depth`, and any auto-promotion adjustments. See [docs/layout-and-routing-algorithms.md](layout-and-routing-algorithms.md) for details.

### Additional Dependencies

Additional (non-hierarchy) dependency edges are stored on the **levels**, not on the node itself. See `Level.additionalDependencyLevelIds`.

---

## Level

A progress level within a node. Nodes can have one or more levels, each representing a distinct milestone or phase of work.

```ts
interface Level {
  id:                          string            // UUID
  label:                       string            // level display name (e.g. "Level 1")
  statuses:                    Record<string, StatusKey>
                                                 // { [releaseId]: statusKey }
  releaseNote:                 string            // Markdown string
  scopeIds:                    string[]          // IDs of assigned scopes
  additionalDependencyLevelIds: string[]         // IDs of other levels this one depends on
  effort:                      Effort
  benefit:                     Benefit
}
```

### Level Status Resolution

A level's effective status for a given release is:
1. `level.statuses[releaseId]` if present
2. Otherwise `'later'` (default)

The node's top-level status badge in the tree is derived from the "display level" — the first level in `levels[]` that has a non-`later` status for the currently selected release.

---

## Segment

A topic category that groups nodes angularly on the radial canvas. Each node belongs to exactly one segment.

```ts
interface Segment {
  id:    string   // UUID
  label: string   // display name (e.g. "Backend", "Frontend")
}
```

Segments are ordered in `document.segments[]`. The order determines the angular sequence on the canvas. The layout optimizer may reorder segments internally to minimize edge crossings, but the canonical order in the document is preserved.

---

## Scope

A named label that can be assigned to one or more node levels. Scopes represent phases, releases, or tracks (e.g., "Alpha", "Beta", "Q1 2026").

```ts
interface Scope {
  id:    string   // UUID
  label: string   // display name
}
```

Scopes are stored in `document.scopes[]`. A level references scopes by ID in `level.scopeIds[]`.

---

## Release

A release milestone. A document always has at least one release. The active release determines which status values are displayed per level.

```ts
interface Release {
  id:               string       // UUID
  name:             string       // display name (e.g. "Release 1")
  motto:            string       // optional tagline
  introduction:     string       // Markdown introduction text
  date:             string       // ISO 8601 date string (YYYY-MM-DD) or empty
  storyPointBudget: number|null  // optional total story-point budget for the release
}
```

---

## Effort

Represents the estimated implementation effort for a level.

```ts
interface Effort {
  size:         'unclear' | 'xs' | 's' | 'm' | 'l' | 'xl' | 'custom'
  customPoints: number | null   // only set when size === 'custom'
}
```

---

## Benefit

Represents the estimated business benefit of a level.

```ts
interface Benefit {
  size: 'unclear' | 'xs' | 's' | 'm' | 'l' | 'xl'
}
```

---

## Status Keys

| Key | Display | Meaning |
|---|---|---|
| `done` | Done | Completed |
| `now` | Now | Currently in progress |
| `next` | Next | Planned for the near future |
| `later` | Later | Backlog / no immediate plan |
| `hidden` | Hidden | Excluded from layout and exports |

German aliases (`fertig`, `jetzt`, `später`, `spaeter`) are accepted in CSV import and normalized on load.

---

## Story Point Map

Maps T-shirt effort sizes to numeric story points. Configurable per document.

```ts
interface StoryPointMap {
  xs: number   // default: 1
  s:  number   // default: 3
  m:  number   // default: 5
  l:  number   // default: 8
  xl: number   // default: 13
}
```

The `custom` effort size uses `Level.effort.customPoints` directly and ignores the map.

---

## Serialized Payload (localStorage / HTML export)

The document is wrapped in a versioned payload envelope before serialization:

```json
{
  "schemaVersion": 3,
  "document": {
    "segments": [ … ],
    "children": [ … ],
    "scopes": [ … ],
    "releases": [ … ],
    "centerIconSrc": "data:image/svg+xml;…",
    "storyPointMap": { "xs": 1, "s": 3, "m": 5, "l": 8, "xl": 13 },
    "showHiddenNodes": false
  }
}
```

### localStorage Key

`roadmap-skilltree.document.v1`

### HTML Export Injection

The payload is injected as a JSON string inside a `<script>` tag in the exported HTML:

```html
<script id="skilltree-export-data" type="application/json">
  { "schemaVersion": 3, "document": { … } }
</script>
```

The interactive HTML viewer reads this script tag on load to restore the document without a server round-trip.

---

## Complete Example

```json
{
  "segments": [
    { "id": "seg-fe", "label": "Frontend" },
    { "id": "seg-be", "label": "Backend" }
  ],
  "scopes": [
    { "id": "scope-alpha", "label": "Alpha" }
  ],
  "releases": [
    {
      "id": "rel-1",
      "name": "Release 1",
      "motto": "First ship",
      "introduction": "Initial release.",
      "date": "2026-06-01",
      "storyPointBudget": 40
    }
  ],
  "centerIconSrc": "data:image/svg+xml;…",
  "storyPointMap": { "xs": 1, "s": 3, "m": 5, "l": 8, "xl": 13 },
  "showHiddenNodes": false,
  "children": [
    {
      "id": "node-fe",
      "label": "Frontend",
      "shortName": "FE",
      "segmentId": "seg-fe",
      "ebene": null,
      "levels": [
        {
          "id": "lvl-fe-1",
          "label": "Level 1",
          "statuses": { "rel-1": "now" },
          "releaseNote": "# Frontend\n\nInitial UI work.",
          "scopeIds": ["scope-alpha"],
          "additionalDependencyLevelIds": [],
          "effort": { "size": "m", "customPoints": null },
          "benefit": { "size": "l" }
        }
      ],
      "children": [
        {
          "id": "node-ui",
          "label": "UI Components",
          "shortName": "UI",
          "segmentId": "seg-fe",
          "ebene": null,
          "levels": [
            {
              "id": "lvl-ui-1",
              "label": "Level 1",
              "statuses": { "rel-1": "next" },
              "releaseNote": "",
              "scopeIds": [],
              "additionalDependencyLevelIds": [],
              "effort": { "size": "s", "customPoints": null },
              "benefit": { "size": "m" }
            }
          ],
          "children": []
        }
      ]
    }
  ]
}
```
