import { generateUUID } from './uuid'

const uid = () => generateUUID()
const level = (status, releaseNote = '') => ({
  id: uid(),
  label: 'Level 1',
  status,
  releaseNote,
})
const SEGMENT_FRONTEND = 'segment-frontend'
const SEGMENT_BACKEND = 'segment-backend'

export const initialData = {
  systemName: 'myKyana',
  release: { name: 'July 2026 Release', motto: 'Reich & Schön', introduction: '' },
  // Synthetic container only; not rendered as a selectable node.
  segments: [
    { id: SEGMENT_FRONTEND, label: 'Frontend' },
    { id: SEGMENT_BACKEND, label: 'Backend' },
  ],
  scopes: [],
  children: [
    {
      id: uid(),
      label: 'Frontend',
      shortName: 'FND',
      status: 'done',
      levels: [level('done', 'Landing page and design system are live for all customers.')],
      ebene: null,
      segmentId: SEGMENT_FRONTEND,
      children: [
        {
          id: uid(),
          label: 'React Core',
          shortName: 'RCT',
          status: 'done',
          levels: [level('done', 'Core components have passed usability validation.')],
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          children: [],
        },
        {
          id: uid(),
          label: 'Tailwind UI',
          shortName: 'TWD',
          status: 'next',
          levels: [level('next', 'UI polish is queued for the next delivery window.')],
          ebene: null,
          segmentId: SEGMENT_FRONTEND,
          children: [],
        },
      ],
    },
    {
      id: uid(),
      label: 'Backend',
      shortName: 'BCK',
      status: 'now',
      levels: [level('now', 'Service hardening is in active implementation.')],
      ebene: null,
      segmentId: SEGMENT_BACKEND,
      children: [
        {
          id: uid(),
          label: 'API Design',
          shortName: 'API',
          status: 'now',
          levels: [level('now', 'New API contracts are being validated with pilot customers.')],
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          children: [],
        },
        {
          id: uid(),
          label: 'DB Modeling',
          shortName: 'DBM',
          status: 'later',
          levels: [level('later', 'Data model refactoring is parked for a later phase.')],
          ebene: null,
          segmentId: SEGMENT_BACKEND,
          children: [],
        },
      ],
    },
  ],
}
