/**
 * Test Utilities für Skill-Tree Tests
 * Stellt Helper-Funktionen zum Erstellen von Test-Bäumen bereit
 */

const uid = () => crypto.randomUUID()

const SEGMENT_FRONTEND = 'segment-frontend'
const SEGMENT_BACKEND = 'segment-backend'
const SEGMENT_DB = 'segment-db'

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
      children: [
        {
          id: 'child-react',
          label: 'React',
          status: 'fertig',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          children: [],
        },
        {
          id: 'child-vue',
          label: 'Vue',
          status: 'später',
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
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
      children: [
        {
          id: 'child-api',
          label: 'API Design',
          status: 'jetzt',
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          children: [],
        },
        {
          id: 'child-db',
          label: 'Database',
          status: 'später',
          ebene: null,
          segmentId: SEGMENT_BACKEND,
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

/**
 * Findet einen Node in einem Baum
 */
export const findNodeInTree = (tree, nodeId) => {
  const queue = [...(tree.children ?? [])]
  while (queue.length > 0) {
    const node = queue.shift()
    if (node.id === nodeId) return node
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
