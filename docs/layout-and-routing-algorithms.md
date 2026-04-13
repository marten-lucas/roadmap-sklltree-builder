# Skill Tree — Layout & Routing Algorithms

## 1. Overview

The skill tree is rendered as a **concentric-ring radial layout**. Nodes sit on discrete rings (one per level). All connections are drawn as **radial polylines**: paths composed exclusively of circular arcs (concentric with the origin) and straight radial spokes (rays from the origin). No diagonal or arbitrary-angle segments are permitted.

Two distinct visual primitives represent connections:

| Type | Rendered as | Criteria |
|---|---|---|
| **Line connection** | SVG `<path>` (radial polyline) | Hierarchy edge that can be drawn without visual conflict |
| **Portal connection** | Paired SVG icons (cup + ring) on source and target node | Additional (non-hierarchy) dependency, or any edge that would visually cross another edge or pass through an unrelated node |

---

## 2. Configuration (`TREE_CONFIG`)

| Parameter | Default | Description |
|---|---|---|
| `nodeSize` | `120 px` | Rendered node diameter |
| `levelSpacing` | `180 px` | Base radial distance between consecutive levels |
| `maxAngleSpread` | `270°` | Maximum arc span of all nodes combined |
| `minArcGapFactor` | `1.08` | Minimum angular gap between sibling nodes expressed as a multiple of `nodeSize` |
| `routingProfile` | `'strict'` | Controls trunk-sharing thresholds (balanced / strict) |
| `promotionProfile` | `'balanced'` | Level auto-promotion aggressiveness |
| `separatorHomogeneityProfile` | `'balanced'` | Separator-line detour consistency (off / balanced / strong) |
| `horizontalPadding` | `600 px` | Canvas padding left and right |
| `topPadding` / `bottomPadding` | `600 px` | Canvas padding top and bottom |

---

## 3. Node Layout Algorithm

### 3.1 Input Model

The tree data is parsed into a d3-hierarchy (`root`). Every non-root node carries:
- `id`, `label`, `shortName`, `status`
- `segmentId` — the topic category it belongs to
- `ebene` (optional) — an explicit level override

### 3.2 Level Assignment

Each node's **effective level** is resolved in priority order (highest first):

| Priority | Source | Description |
|---|---|---|
| 1 | `reDemotionLevelById` | Phase 4: portalized-parent subtree re-rooted to lowest free ring |
| 2 | `compactedLevelById` | Phase 3: fully-portalized node moved to inner ring |
| 3 | `crossingPromotedLevelById` | Phase 2: child promoted +1 to open routing corridor |
| 4 | `autoPromotedLevelById` | Phase 1: angular conflict resolution |
| 5 | `node.data.ebene` | Explicit level from input data |
| 6 | `node.depth` | Default tree depth |

### 3.3 Two-Pass Layout with Crossing-Aware Level Adjustment

The complete layout runs in at most two passes:

**Pass 1 — Initial layout**  
All nodes placed at their Phase-1 effective levels. After computing positions and routes, `detectCrossingLinks` identifies conflicting edges.

If no crossings are found, Pass 1 is final.

**Phase 2 — Crossing Promotion** (computed between passes)  
For each crossing edge where `childLevel − parentLevel ≤ 1` **and** the child has its own line children (routing corridor needed):
```
crossingPromotedLevel = childLevel + 1
cap = baseLevel + 4   (baseLevel = ebene or depth, shared ceiling with auto-promotion)
```
Prevents "rat race": promotion is capped at +1 per crossing pass; the combined ceiling (base + 4) is shared with auto-promotion; Phase 2 runs exactly once.

**Phase 3 — Compaction** (computed between passes)  
For any crossing edge where the child node has **zero remaining line connections** (all edges involving it are portalized):
```
compactedLevel = max(1, parentLevel − 1)
```
The node is moved to a ring just inside its parent. Since the connection is a portal (never drawn as a line), the ring position serves only as a visual parking spot. The compacted edge is **forced to remain a portal** in the final detection even if the second-pass path avoids geometric crossings.

Phase 2 and Phase 3 are mutually exclusive per node (a node with routing obligations for its children → Phase 2; a fully portalized node → Phase 3).

**Phase 4 — Portalized-parent subtree re-rooting** (computed between passes)  
Applies when a node was auto-promoted (Phase 1) because its declared tree-parent lives in a distant segment, **and** that parent→child edge turned out to be portalized. With the line connection gone, the promotion overhead is wasted — the subtree should be anchored in its own segment as compactly as possible.

Trigger conditions (all must hold for the crossing edge `parent → child`):
- child was promoted by Phase 1 auto-promotion (`autoPromotedLevelById`)
- neither Phase 2 nor Phase 3 already adjusted the child
- child has at least one remaining line connection (otherwise Phase 3 would have fired)

Algorithm:
```
occupiedInSegment = { level(n) | n in same segment, n not in subtree(child) }
lowestFreeLevel   = min integer ≥ 1 not in occupiedInSegment
delta             = lowestFreeLevel − child.level   (always < 0 = demotion)
for each node in subtree(child):
    reDemotedLevel = node.level + delta
```
The entire subtree shifts by the same delta, preserving internal ring spacing. The portalized parent→child edge continues to be rendered as a portal in the final output.

**Pass 2 — Re-layout**  
If any Phase 2, 3, or 4 adjustments were computed, the full layout reruns with updated effective levels. A final `detectCrossingLinks` determines the definitive set of portals.

**Rat-race prevention**: the entire two-pass sequence runs at most twice (hard loop limit); all adjustment maps are written only between Pass 1 and Pass 2 and are never modified again.

### 3.5 Ring Radii

One ring per unique effective level is computed:

```
radius(level) = max(
  level × levelSpacing × spacingScale × deepCompressionFactor,
  previousRadius + levelSpacing,
  minimumRadiusToFitNodeCount,
  minimumRadiusForSegmentLabelBand   (level-1 only)
)
```

- **`spacingScale`** iterates up to 6 times to keep the total angular spread ≤ `maxAngleSpread × 1.02`.
- **`deepCompressionFactor`** gently compresses radius growth when the tree exceeds 8–14 levels (only when levels are not manually assigned).
- **Monotonicity** is enforced after each capacity round: `radius(L+1) ≥ radius(L) + levelSpacing`.

### 3.6 Segment Angular Slots

Segments (topic categories) divide the full `maxAngleSpread` arc into proportional slots.  
Slot width is weighted by **node count** with a minimum width large enough to fit the segment label text.  
A small slack budget (≈ `0.4° × (segmentCount − 1)`) provides visual breathing room.

### 3.7 Angular Span & Placement

Node positions are computed in three passes:

**Pass 1 — Span computation (bottom-up)**  
For each subtree the minimum angular span is derived from pairwise sibling distances:

```
siblingDistance(A, B) = (span_A + span_B) / 2 + baseGap
```

Cross-segment siblings receive an additional `× crossSegmentGapFactor (1.05)` gap. `baseGap` is `nodeSize × minArcGapFactor / radius` converted to degrees.

**Pass 2 — Angle assignment (top-down)**  
Children are placed symmetrically around their parent's angle, offset by the distances computed in pass 1.

**Pass 3 — Segment alignment**  
Root-level subtrees per segment are blended toward their slot centre. For dense trees (> 4 filled segments) the blend leans heavily toward the packed position (factor ≈ 0.88); for sparse trees it blends 50/50. Edge-pinning ensures the outermost filled group of each segment doesn't leave a large gap at the arc boundary.

### 3.8 Capacity Packing (iterative)

After angle assignment, each `(segment, level)` group is checked for feasibility:

- **`centerGap`** — minimum angular spacing between nodes at that ring, derived from both `nodeAngularWidthPx` and `minimumArcGap`.
- Nodes within the group are placed at evenly-spaced centres starting from their parent-preferred angle.
- Forward and backward clamping passes enforce `centerGap`.
- If any group is infeasible, the ring radius for that level is increased and the whole capacity loop reruns (up to 8 attempts).

**Post-pack nudge**: after packing converges, each group is shifted as a unit toward cross-segment parents/children to close angular gaps between connected subtrees in different segments.

### 3.9 Post-Packing Gap Compaction

After capacity-packing and the post-pack nudge, large angular voids can remain between node clusters — either between two different segments, or between two sub-trees within the same segment. These voids inflate the total tree spread without visual benefit.

**Algorithm** (runs once, after packing converges):

1. Sort all nodes by their final packed angle.
2. Compute each node's visual half-span: `halfSpan = nodeSize × 0.56 × 180° / (π × radius)`.
3. Scan consecutive node pairs left-to-right. For each **edge-to-edge** gap that exceeds the threshold:
   ```
   gap = rightNode.angle − rightNode.halfSpan − (leftNode.angle + leftNode.halfSpan)
   if gap > GAP_COMPACTION_THRESHOLD_DEG (14°):
       shift = gap − GAP_COMPACTION_MIN_DEG (8°)
       move all nodes from rightNode onward leftward by shift
   ```
   The scan runs right-to-left so earlier shifts do not invalidate later distance measurements.
4. Recompute per-segment angular extents from the shifted node positions.
5. Re-stitch `orderedSegments` wedge/slot boundaries using midpoints between adjacent segment extents, so that downstream routing and separator passes see consistent boundaries.
6. Tighten the rightmost segment's outer boundary to match its actual node extent.

**Scope**: gaps between *any* two adjacent nodes in the sorted order are eligible, not only inter-segment gaps. This handles cases such as a single large segment with two widely-separated sub-trees.

**Safety**: because compaction runs before the `nodes` array and the edge-routing model are built, all downstream code (routing, separators, portals) uses the compacted positions directly — no new path crossings are introduced.

### 3.10 Final Cartesian Coordinates

```
x = origin.x + radius × cos(angle_rad)
y = origin.y + radius × sin(angle_rad)
```

`angle = 0°` points right (3 o'clock); angles increase clockwise.  
`centerAngle = 270°` (top of the ring, 12 o'clock).

---

## 4. Connection Drawing Algorithms

### 4.1 Routing Primitives

All paths are SVG `M … A … L …` sequences using only two primitives:

| SVG command | Geometric meaning |
|---|---|
| `L x y` | Radial spoke — straight line toward or away from the origin |
| `A r r 0 0 s x y` | Concentric arc at radius `r` |

No other angles are used. Any segment connecting two points that are neither collinear with the origin nor equidistant from it must use a combination of the two primitives above.

### 4.2 Edge Routing Model

Before path strings are computed, edges are grouped into **trunk groups**:

- Children that share the same parent and whose angles are within an adaptive threshold (`clusterThresholdDeg`) — scaled by node density at the target ring — are placed into the same trunk group.
- The **trunk angle** is placed at the midpoint of the largest angular gap between the children in the group (to ensure the trunk never overlaps a child node).
- The `routingProfile` controls: `strict` uses a tighter cross-segment threshold (`× 0.82`) and disallows trunk sharing across non-adjacent segments.

### 4.3 Line Connection Path Shapes

#### Single child (no shared trunk)

```
M parent  →  A @sourceRadius  →  L child
```
Arc along the source ring from the parent's angle to the child's angle, then radial spoke to the child. (Direct MALAL route via `buildRadialArcPath`.)

#### Multiple children — sufficient corridor gap (`levelGap ≥ nodeSize`)

The corridor ring sits at a biased radius between the two node rings. For edges that span multiple segments (large angular distance), the corridor is biased towards the target ring (`0.62 × levelGap`) to "duck" under potential blockers in intermediate segments. For single-segment edges, the corridor sits at a neutral `0.48-0.54 × levelGap`.

```
M parent
→ A @sourceRadius              (arc to trunk angle)
→ L corridorTrunkPoint          (radial spoke outward)
→ A @corridorRadius             (arc from trunk angle to child angle)
→ L child                       (radial spoke to child)
```

All siblings in the same trunk group share the first three segments; only the final arc+spoke is unique per child, so paths visually diverge at the corridor fork point. The corridor arc never reaches either node ring, so it cannot appear to "bridge" two sibling nodes.

#### Multiple children — tight gap (`levelGap < nodeSize`)

Falls back to arcing on the target ring:

```
M parent
→ A @sourceRadius              (arc to trunk angle)
→ L targetTrunkPoint            (radial spoke full distance)
→ A @targetRadius               (arc from trunk angle to child angle)
```

### 4.4 Automated Root Order Refinement

After the packing and compaction phases, a **Late Root Refinement** pass runs a local search over the root-level nodes.

1. **Greedy Swaps**: Adjacent roots in the global circular order are swapped.
2. **Scoring**: A configuration is "better" if:
    - It has fewer total portals (most important).
    - It has fewer portals involving root-level edges.
    - It has lower total angular penalty (straighter root-child connections).
3. **Global Scope**: Swaps are attempted across segment boundaries to ensure the best possible global root order, significantly reducing portals in complex multi-segment trees.

### 4.5 Segment Separator Lines

Separator lines are drawn between adjacent segments. They follow a radial spoke from `separatorInnerRadius` to `separatorOuterRadius` but deflect around any node that blocks the nominal angle. Detours are arc segments at the blocker's radius, stepping left or right to clear the node, then resuming the radial direction.

A two-pass optimisation picks a globally consistent detour direction:
1. Baseline pass: each separator chooses independently.
2. Candidate pass: all separators bias toward the dominant direction from pass 1 (neighbour-bias propagation).
The pass with better homogeneity score (fewer direction changes + less total detour angle) is selected.

---

## 5. Portal Connection Rendering

Portals appear when a direct line cannot be drawn cleanly. Both endpoints display a paired icon (a "cup" on the source, a "ring" on the target) indicating that the connection exists but is not shown as a line.

### 5.1 User-defined Additional Dependencies

Nodes can declare extra parents beyond the tree hierarchy via the CSV `additional_dependencies` column. These edges are never routed as lines; they are unconditionally rendered as portals.

### 5.2 Crossing Detection → Auto-generated Portals

`detectCrossingLinks(links, { nodes, nodeSize })` runs on every full layout computation. It has three phases:

**Phase 1 — Node-area collision (unconditional)**  
Each edge path is approximated as a polyline (arcs sampled at 5 points). If any segment of the polyline passes within `nodeSize / 2` of a node that is neither the source nor target of that edge, the edge is immediately converted to a portal. No greedy minimisation is applied; there is no alternative routing.

**Phase 2 — Edge-edge crossing detection**  
All pairs of candidate edges (excluding already-portalized edges and pairs that share a source or target) are tested for strict interior segment intersection. Two segments cross only when both parametric parameters are strictly in `(ε, 1−ε)`, excluding shared-fork touches.

**Phase 3 — Greedy minimisation**  
The edge involved in the most crossing pairs is portalized first. Pairs resolved by that conversion are removed; the process repeats until no crossing pairs remain. This minimises the total number of portals.

**Auto-revert**: the detection runs fresh on every layout call. If a layout change resolves a crossing (e.g. a node moves to a different ring), the affected edge automatically reverts to a line without any stored state.

### 5.3 Portal Rendering Pipeline

Crossing portals and additional-dependency portals go through the same pipeline in `SkillTree.jsx`:

1. `pushEndpoint(nodeId, endpoint)` accumulates portal entries keyed by node.
2. `visibleDependencyPortals` filters to currently rendered nodes.
3. `SkillTreeCanvas` renders each portal as a cup+ring icon pair on the node.
4. Crossing portals are marked `isCrossing: true`, which excludes them from the inspector's dependency summary (they represent hierarchy edges, not additional dependencies).
5. Crossing portals are marked `isInteractive: false` (not clickable).

---

## 6. Layout Requirements Summary

| Requirement | Implementation |
|---|---|
| Nodes sit on discrete concentric rings (one per level) | `radiusByLevel` map, Cartesian conversion |
| All connections are radial polylines (arcs + spokes only; no diagonal lines) | `buildRadialArcPath`, corridor routing with `A`+`L` only |
| Minimum angular gap between siblings ≥ `nodeSize × 1.08 / radius` | `minimumArcGap`, sibling-distance function |
| Total angular spread ≤ 270° | Iterative `spacingScale` expansion loop |
| Nodes in the same segment are grouped angularly | Segment-slot allocation, root-group alignment |
| Connections within a trunk group visually share a common trunk | Cluster grouping, corridor fork point |
| No connection passes through an unrelated node's area | Phase 1 node-collision portal conversion |
| No two unrelated connections cross each other visually | Phase 2–3 greedy portal conversion |
| Segment boundaries are marked by separator lines that avoid nodes | `buildSeparatorPathWithDetours` with arc detours |
| Additional (non-hierarchy) dependencies are shown as portals | `additionalDependencies` field → portal pipeline |
| Portals auto-revert to lines when the layout resolves the conflict | Stateless per-layout `detectCrossingLinks` |
| Child with crossing + routing needs (has own children) promoted +1 ring | Phase 2 `crossingPromotedLevelById`, hard cap base+4 |
| Fully-portalized node (no line connections) compacted to inner ring | Phase 3 `compactedLevelById = max(1, parentLevel−1)`, forced portal |
| Level adjustments cannot loop indefinitely | Two-pass loop limit; maps written once between passes |
| Large angular voids (> 14°) between node clusters are closed | Post-packing gap compaction: shift right half leftward to leave ≤ 8° gap |
