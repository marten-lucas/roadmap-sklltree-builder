/**
 * Edge crossing detection for radial skill-tree layouts.
 *
 * Detects which hierarchy edges visually cross other edges in a confusing way
 * and returns a minimal set of edge IDs that should be shown as portal icons
 * instead of direct lines.  When the layout changes and a crossing is resolved
 * the affected IDs no longer appear in the result, so connections automatically
 * revert to regular lines.
 */

/**
 * Samples N points on a circular SVG arc from (x1,y1) to (x2,y2).
 * Handles both sweep directions (0 = CCW, 1 = CW in SVG coordinates).
 * Returns an array of {x,y} points including the endpoint.
 */
function svgArcPoints(x1, y1, r, sweep, x2, y2, n = 5) {
  const dx = x2 - x1
  const dy = y2 - y1
  const d2 = dx * dx + dy * dy
  if (d2 < 0.001 || r < 0.001) return [{ x: x2, y: y2 }]

  const chord = Math.sqrt(d2)
  const h = Math.sqrt(Math.max(0, r * r - d2 / 4))

  // Midpoint of chord
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2

  // Left perpendicular of the chord direction (normalised)
  const px = -dy / chord
  const py = dx / chord

  // For sweep=1 (CW in SVG), center is to the left of start→end direction
  const sign = sweep === 1 ? 1 : -1
  const cx = mx + sign * h * px
  const cy = my + sign * h * py

  let startAngle = Math.atan2(y1 - cy, x1 - cx)
  let endAngle = Math.atan2(y2 - cy, x2 - cx)

  if (sweep === 1) {
    if (endAngle < startAngle) endAngle += 2 * Math.PI
  } else {
    if (endAngle > startAngle) endAngle -= 2 * Math.PI
  }

  const points = []
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const angle = startAngle + t * (endAngle - startAngle)
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
  }
  return points
}

/**
 * Parses an SVG path string (M, L, A commands) into an array of line segments
 * { x1, y1, x2, y2 }.  Arc commands are approximated as polylines.
 */
export function pathToSegments(pathStr) {
  const tokens = String(pathStr ?? '').trim().split(/\s+/)
  const segments = []
  let i = 0
  let cx = 0
  let cy = 0

  while (i < tokens.length) {
    const cmd = tokens[i++]

    if (cmd === 'M') {
      cx = parseFloat(tokens[i++])
      cy = parseFloat(tokens[i++])
    } else if (cmd === 'L') {
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])
      segments.push({ x1: cx, y1: cy, x2: x, y2: y })
      cx = x
      cy = y
    } else if (cmd === 'A') {
      const rx = parseFloat(tokens[i++])
      parseFloat(tokens[i++]) // ry – ignored, assumed equal to rx
      i++ // x-rotation (always 0 for our arcs)
      i++ // large-arc-flag (always 0 for our arcs)
      const sweep = parseFloat(tokens[i++])
      const x = parseFloat(tokens[i++])
      const y = parseFloat(tokens[i++])

      const pts = svgArcPoints(cx, cy, rx, sweep, x, y)
      let prev = { x: cx, y: cy }
      for (const pt of pts) {
        segments.push({ x1: prev.x, y1: prev.y, x2: pt.x, y2: pt.y })
        prev = pt
      }
      cx = x
      cy = y
    }
  }

  return segments
}

/**
 * Returns true when line segment A1→A2 genuinely crosses B1→B2.
 *
 * Both parametric intersection parameters must be strictly interior (> eps,
 * < 1-eps) to exclude shared endpoint touches that occur at fork points.
 */
export function segmentsCross(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2, eps = 0.02) {
  const dax = ax2 - ax1
  const day = ay2 - ay1
  const dbx = bx2 - bx1
  const dby = by2 - by1

  const denom = dax * dby - day * dbx
  if (Math.abs(denom) < 1e-10) return false // parallel / collinear

  const dx = bx1 - ax1
  const dy = by1 - ay1

  const t = (dx * dby - dy * dbx) / denom
  const u = (dx * day - dy * dax) / denom

  return t > eps && t < 1 - eps && u > eps && u < 1 - eps
}

/**
 * Returns true if any segment in segsA genuinely crosses any segment in segsB.
 */
function polylinesCross(segsA, segsB) {
  for (const a of segsA) {
    for (const b of segsB) {
      if (segmentsCross(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2)) {
        return true
      }
    }
  }
  return false
}

/**
 * Squared distance from point (px,py) to line segment (ax,ay)→(bx,by).
 * Uses clamped projection so the closest point is always on the segment.
 */
function pointToSegDistSq(px, py, ax, ay, bx, by) {
  const dax = bx - ax
  const day = by - ay
  const len2 = dax * dax + day * day
  if (len2 < 1e-10) {
    const dx = px - ax
    const dy = py - ay
    return dx * dx + dy * dy
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dax + (py - ay) * day) / len2))
  const cx = ax + t * dax
  const cy = ay + t * day
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy
}

/**
 * Returns true if any segment of the polyline passes within `radius` of (cx, cy).
 * Exported for unit testing.
 */
export function polylineHitsCircle(segs, cx, cy, radius) {
  const r2 = radius * radius
  for (const s of segs) {
    if (pointToSegDistSq(cx, cy, s.x1, s.y1, s.x2, s.y2) < r2) {
      return true
    }
  }
  return false
}

/**
 * Given the full layout links array and the positioned nodes, returns a minimal
 * Set of link IDs that should become portals because they either:
 *   (a) cross another hierarchy edge, or
 *   (b) pass through a node area they are not connected to.
 *
 * Options:
 *   nodes    – array of {id, x, y} layout nodes (optional; enables node-collision check)
 *   nodeSize – rendered node diameter in px (default 48)
 *
 * Only 'direct' and 'routed' links are considered candidates.
 * Pairs/nodes sharing source or target are never flagged as conflicting.
 *
 * Greedy "convert the edge involved in the most crossings first" keeps
 * the portal count minimal.
 */
export function detectCrossingLinks(links, { nodes = [], nodeSize = 48 } = {}) {
  const candidates = links.filter(
    (l) => (l.linkKind === 'direct' || l.linkKind === 'routed') && l.sourceId != null,
  )

  if (candidates.length === 0) return new Set()

  // Build polyline representation for each candidate
  const polylinesMap = new Map(candidates.map((l) => [l.id, pathToSegments(l.path)]))

  // ── Phase 1: edge-node collisions ────────────────────────────────────────
  // Any edge whose path passes through an unrelated node is unconditionally
  // converted to a portal (there is no alternative routing to try).
  const nodeCollisionIds = new Set()
  if (nodes.length > 0) {
    const collisionRadius = nodeSize * 0.5
    for (const link of candidates) {
      const segs = polylinesMap.get(link.id)
      for (const node of nodes) {
        if (node.id === link.sourceId || node.id === link.targetId) continue
        if (polylineHitsCircle(segs, node.x, node.y, collisionRadius)) {
          nodeCollisionIds.add(link.id)
          break
        }
      }
    }
  }

  // ── Phase 2: edge-edge crossings ─────────────────────────────────────────
  const crossingPairs = []
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]

      // Already handled by node-collision phase
      if (nodeCollisionIds.has(a.id) || nodeCollisionIds.has(b.id)) continue

      // Edges that share a node can never produce a "confusing" crossing
      if (
        a.sourceId === b.sourceId
        || a.sourceId === b.targetId
        || a.targetId === b.sourceId
        || a.targetId === b.targetId
      ) {
        continue
      }

      if (polylinesCross(polylinesMap.get(a.id), polylinesMap.get(b.id))) {
        crossingPairs.push([a.id, b.id])
      }
    }
  }

  // ── Phase 3: greedy minimisation for edge-edge pairs ─────────────────────
  const portalIds = new Set(nodeCollisionIds)
  let remaining = [...crossingPairs]

  while (remaining.length > 0) {
    const counts = new Map()
    for (const [a, b] of remaining) {
      counts.set(a, (counts.get(a) ?? 0) + 1)
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }

    let maxId = null
    let maxCount = 0
    for (const [id, cnt] of counts) {
      if (cnt > maxCount) {
        maxCount = cnt
        maxId = id
      }
    }

    portalIds.add(maxId)
    remaining = remaining.filter(([a, b]) => a !== maxId && b !== maxId)
  }

  return portalIds
}
