/**
 * Test Utilities für Skill-Tree Tests
 * Stellt Helper-Funktionen zum Erstellen von Test-Bäumen bereit
 */

const SEGMENT_FRONTEND = 'segment-frontend'
const SEGMENT_BACKEND = 'segment-backend'
const SEGMENT_DB = 'segment-db'

// Stable level IDs for createSimpleTree nodes
export const LEVEL_ROOT_FRONTEND_1 = 'lvl-root-frontend-1'
export const LEVEL_CHILD_REACT_1 = 'lvl-child-react-1'
export const LEVEL_CHILD_VUE_1 = 'lvl-child-vue-1'
export const LEVEL_ROOT_BACKEND_1 = 'lvl-root-backend-1'
export const LEVEL_CHILD_API_1 = 'lvl-child-api-1'
export const LEVEL_CHILD_DB_1 = 'lvl-child-db-1'

/**
 * Erstellt einen einfachen Test-Baum mit Frontend/Backend Segmenten
 */
export const createSimpleTree = () => ({
  segments: [
    { id: SEGMENT_FRONTEND, label: 'Frontend' },
    { id: SEGMENT_BACKEND, label: 'Backend' },
  ],
  children: [
    {
      id: 'root-frontend',
      label: 'Frontend',
      status: 'fertig',
      ebene: null,
      segmentId: SEGMENT_FRONTEND,
      levels: [{ id: LEVEL_ROOT_FRONTEND_1, status: 'fertig', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
      children: [
        {
          id: 'child-react',
          label: 'React',
          status: 'fertig',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          levels: [{ id: LEVEL_CHILD_REACT_1, status: 'fertig', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
          children: [],
        },
        {
          id: 'child-vue',
          label: 'Vue',
          status: 'später',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          levels: [{ id: LEVEL_CHILD_VUE_1, status: 'später', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
          children: [],
        },
      ],
    },
    {
      id: 'root-backend',
      label: 'Backend',
      status: 'jetzt',
      ebene: null,
      segmentId: SEGMENT_BACKEND,
      levels: [{ id: LEVEL_ROOT_BACKEND_1, status: 'jetzt', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
      children: [
        {
          id: 'child-api',
          label: 'API Design',
          status: 'jetzt',
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          levels: [{ id: LEVEL_CHILD_API_1, status: 'jetzt', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
          children: [],
        },
        {
          id: 'child-db',
          label: 'Database',
          status: 'später',
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          levels: [{ id: LEVEL_CHILD_DB_1, status: 'später', releaseNote: '', scopeIds: [], additionalDependencyLevelIds: [] }],
          children: [],
        },
      ],
    },
  ],
})

/**
 * Erstellt einen Baum mit Cross-Segment Kanten
 */
export const createCrossSegmentTree = () => ({
  segments: [
    { id: SEGMENT_FRONTEND, label: 'Frontend' },
    { id: SEGMENT_BACKEND, label: 'Backend' },
  ],
  children: [
    {
      id: 'root-frontend',
      label: 'Frontend Skills',
      status: 'fertig',
      ebene: null,
      segmentId: SEGMENT_FRONTEND,
      children: [
        {
          id: 'react',
          label: 'React',
          status: 'fertig',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          children: [
            {
              id: 'api-consumption',
              label: 'API Consumption',
              status: 'jetzt',
              ebene: null,
              segmentId: SEGMENT_BACKEND, // Cross-segment!
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-backend',
      label: 'Backend Skills',
      status: 'jetzt',
      ebene: null,
      segmentId: SEGMENT_BACKEND,
      children: [
        {
          id: 'rest-api',
          label: 'REST API',
          status: 'jetzt',
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          children: [],
        },
      ],
    },
  ],
})

/**
 * Erstellt einen Baum mit vielen Knoten im gleichen Segment
 * zum Testen der Kapazitätsprüfung
 */
export const createDenseTree = (segmentId = SEGMENT_FRONTEND, nodeCount = 20) => {
  const children = []
  for (let i = 0; i < nodeCount; i++) {
    children.push({
      id: `node-${i}`,
      label: `Node ${i}`,
      status: i % 3 === 0 ? 'fertig' : i % 3 === 1 ? 'jetzt' : 'später',
      ebene: null,
      segmentId,
      children: [],
    })
  }

  return {
    segments: [
      { id: SEGMENT_FRONTEND, label: 'Frontend' },
      { id: SEGMENT_BACKEND, label: 'Backend' },
    ],
    children: [
      {
        id: 'root-segment',
        label: 'Root',
        status: 'fertig',
        ebene: null,
        segmentId,
        children,
      },
    ],
  }
}

/**
 * Erstellt einen leeren Baum (nur Segmente, keine Knoten)
 */
export const createEmptyTree = () => ({
  segments: [
    { id: SEGMENT_FRONTEND, label: 'Frontend' },
    { id: SEGMENT_BACKEND, label: 'Backend' },
  ],
  children: [],
})

export const createNodelessTree = () => ({
  segments: [],
  children: [],
})

/**
 * Findet einen Node in einem Baum
 */
export const findNodeInTree = (tree, matcher) => {
  const queue = [...(tree.children ?? [])]
  const predicate = typeof matcher === 'function'
    ? matcher
    : (node) => node.id === matcher

  while (queue.length > 0) {
    const node = queue.shift()
    if (predicate(node)) return node
    queue.push(...(node.children ?? []))
  }
  return null
}

/**
 * Zählt die Anzahl der Knoten in einem Baum
 */
export const countNodesInTree = (tree) => {
  let count = 0
  const queue = [...(tree.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    count += 1
    queue.push(...(node.children ?? []))
  }
  return count
}

/**
 * Ruft alle Knoten-IDs eines Segments ab
 */
export const getNodeIdsForSegment = (tree, segmentId) => {
  const ids = []
  const queue = [...(tree.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    if ((node.segmentId ?? null) === segmentId) {
      ids.push(node.id)
    }
    queue.push(...(node.children ?? []))
  }
  return ids
}

export { SEGMENT_FRONTEND, SEGMENT_BACKEND, SEGMENT_DB }
