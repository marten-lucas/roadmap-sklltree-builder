# CSV Format Reference

This document describes the CSV format used by the Skill Tree Builder for import and export.

---

## Table of Contents

- [Overview](#overview)
- [Column Reference](#column-reference)
- [Status Values](#status-values)
- [Effort and Benefit Sizes](#effort-and-benefit-sizes)
- [Multi-Level Nodes](#multi-level-nodes)
- [Additional Dependencies](#additional-dependencies)
- [Scopes](#scopes)
- [Release Notes](#release-notes)
- [Header Aliases](#header-aliases)
- [Import Behavior](#import-behavior)
- [Export Behavior](#export-behavior)
- [Example](#example)

---

## Overview

The CSV uses a **flat row-per-level** format. Each row represents one **level** of one **node**. A node with multiple levels has multiple consecutive rows with the same `ShortName` (and usually the same `Name`, `Segment`, and `Parent`).

- Encoding: UTF-8 (BOM is stripped on import)
- Delimiter: `,` (comma)
- Quoting: standard RFC 4180 — fields containing commas, quotes, or newlines must be double-quoted; embedded quotes are doubled (`""`)

---

## Column Reference

| Column | Required | Description |
|---|---|---|
| `ShortName` | Yes | 1–3 character abbreviated identifier. Uniquely groups rows belonging to the same node. Auto-generated on export if empty. |
| `Name` | Yes | Full display name of the node. |
| `Scope` | No | A scope tag to assign to this level. Creates the scope automatically if it does not exist. Multiple scopes per level: use separate rows with the same `ShortName` + `ProgressLevel`, or a space-separated list. |
| `Ebene` | No | Explicit level override (integer ≥ 1). Overrides the tree-depth-based level. Leave blank to use automatic depth. |
| `Segment` | No | Name of the segment (topic category) this node belongs to. Creates the segment automatically if it does not exist. |
| `Parent` | No | `ShortName` of the parent node. Blank = root-level node. |
| `AdditionalDependency` | No | `ShortName` of an additional (non-hierarchy) dependency node. Creates a portal connection. |
| `ProgressLevel` | No | Integer ≥ 1. Identifies which level of this node the row applies to. Defaults to `1` if blank. |
| `Status` | No | Node/level status. See [Status Values](#status-values). Defaults to `later`. |
| `ReleaseNotes` | No | Markdown-formatted release note for this level. Multi-line values must be quoted. |
| `Effort` | No | Effort size. See [Effort and Benefit Sizes](#effort-and-benefit-sizes). |
| `EffortCustomPoints` | No | Numeric story-point value. Only used when `Effort` is `custom`. |
| `Benefit` | No | Benefit size. See [Effort and Benefit Sizes](#effort-and-benefit-sizes). |

---

## Status Values

| CSV value | Canonical key | Meaning |
|---|---|---|
| `done` / `fertig` | `done` | Completed |
| `now` / `jetzt` | `now` | In progress / current focus |
| `next` | `next` | Planned for next cycle |
| `later` / `spaeter` / `später` | `later` | Backlog / future |
| `hidden` | `hidden` | Excluded from layout and exports |

Case-insensitive. Unknown values fall back to `later`.

---

## Effort and Benefit Sizes

### Effort (`Effort` column)

| Value | Meaning | Default story points |
|---|---|---|
| `unclear` | Not yet estimated | — |
| `xs` | Extra Small | 1 |
| `s` | Small | 3 |
| `m` | Medium | 5 |
| `l` | Large | 8 |
| `xl` | Extra Large | 13 |
| `custom` | Custom point value | see `EffortCustomPoints` |

### Benefit (`Benefit` column)

| Value | Meaning |
|---|---|
| `unclear` | Not assessed |
| `xs` | Extra Small |
| `s` | Small |
| `m` | Medium |
| `l` | Large |
| `xl` | Extra Large |

Both columns are case-insensitive. Unknown values fall back to `unclear`.

---

## Multi-Level Nodes

A node with multiple progress levels is represented by multiple rows with the same `ShortName`. The `ProgressLevel` column distinguishes each level.

```csv
ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes,Effort,EffortCustomPoints,Benefit
API,API Integration,Alpha,,Backend,SVC,,1,now,# API Level 1,m,,l
API,API Integration,Beta,,Backend,SVC,,2,next,# API Level 2,l,,xl
API,API Integration,Gamma,,Backend,SVC,,3,later,# API Level 3,xl,,xl
```

The `Name`, `Segment`, `Parent`, and `Ebene` from the **first row** for each `ShortName` are used for the node itself. Subsequent rows update only the corresponding level's `Status`, `Scope`, `ReleaseNotes`, `Effort`, `Benefit`.

---

## Additional Dependencies

`AdditionalDependency` links one node to another with a non-hierarchy edge (rendered as a portal connection). Use the `ShortName` of the target node.

```csv
QA,QA Gate,,,,API,DOC,1,done,,l,,s
```

This creates portal connections from `QA → API` and `QA → DOC`.

Multiple dependencies: add extra rows with the same node identity and different `AdditionalDependency` values, or list them in separate rows.

---

## Scopes

`Scope` assigns a named scope tag to the level. Scope names are created automatically when importing if they do not already exist.

A level can have multiple scope tags. To assign more than one scope to a single level, list each scope on its own row with the same `ShortName` and `ProgressLevel`:

```csv
API,API Integration,Alpha,,Backend,SVC,,1,now,,m,,l
API,API Integration,Beta,,Backend,SVC,,1,now,,m,,l
```

Both `Alpha` and `Beta` scopes are assigned to level 1 of the `API` node.

---

## Release Notes

The `ReleaseNotes` column accepts Markdown. Multi-line content must be RFC 4180 double-quoted:

```csv
MIN,Minimal Node,,1,Core,,,1,now,"# Minimal Node

The first milestone is **ready**.

- bullet one
- bullet two",m,,l
```

Standard CSV escaping applies: embedded double-quotes are doubled (`""`).

---

## Header Aliases

The importer accepts case-insensitive header aliases:

| Canonical Header | Accepted Aliases |
|---|---|
| `ShortName` | `shortname`, `node short name` |
| `Name` | `name`, `node name` |
| `Scope` | `scope` |
| `Ebene` | `ebene`, `level` |
| `Segment` | `segment` |
| `Parent` | `parent` |
| `AdditionalDependency` | `additionaldependency`, `additional dependency` |
| `ProgressLevel` | `progresslevel`, `progress level` |
| `Status` | `status` |
| `ReleaseNotes` | `releasenotes`, `release notes` |
| `Effort` | `effort` |
| `EffortCustomPoints` | `effortcustompoints`, `effort custom points` |
| `Benefit` | `benefit` |

Extra or unknown columns are ignored.

---

## Import Behavior

1. UTF-8 BOM is stripped.
2. The header row is detected and column positions are resolved (aliases accepted).
3. Rows are grouped by `ShortName`.
4. The first row for each `ShortName` establishes the node identity (Name, Segment, Parent, Ebene).
5. Each row within the group sets up a level at the given `ProgressLevel` (default `1`).
6. Parent relationships are resolved by `ShortName` after all rows are processed.
7. `AdditionalDependency` references are resolved by `ShortName`; forward-references are supported.
8. New segments and scopes are created automatically if they appear in the CSV and don't exist yet.
9. A single default release is created for the imported document.

### What the import does NOT do

- It does not merge with an existing document — a CSV import **replaces** the current document.
- It does not carry over release definitions (a fresh release is created).
- It does not support multi-root CSV (every node must have at most one `Parent`).

---

## Export Behavior

The export produces one row per **level** per **node** (same structure as import). Headers match the canonical column names exactly. Values are RFC 4180 encoded. The file is named `skilltree-roadmap.csv`.

Nodes with `status = hidden` are included in the export unless filtered by context.

---

## Example

```csv
ShortName,Name,Scope,Ebene,Segment,Parent,AdditionalDependency,ProgressLevel,Status,ReleaseNotes,Effort,EffortCustomPoints,Benefit
FE,Frontend,,1,Frontend,,,1,now,# Frontend,m,,l
BE,Backend,,1,Backend,,,1,now,# Backend,m,,l
API,API Layer,,2,Backend,BE,,1,next,# API Layer,l,,xl
UI,UI Components,,2,Frontend,FE,,1,next,# UI Components,s,,m
AUTH,Auth Service,,3,Backend,API,BE,1,later,"# Auth Service

Depends on both API and Backend directly.",xl,,xl
```

This produces a tree with:
- Two root nodes (`FE` and `BE`) in separate segments
- `API` as a child of `BE`
- `UI` as a child of `FE`
- `AUTH` as a child of `API`, with an additional portal dependency on `BE`
