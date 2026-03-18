const uid = () => crypto.randomUUID()
const SEGMENT_FRONTEND = 'segment-frontend'
const SEGMENT_BACKEND = 'segment-backend'

export const initialData = {
  // Synthetic container only; not rendered as a selectable node.
  segments: [
    { id: SEGMENT_FRONTEND, label: 'Frontend' },
    { id: SEGMENT_BACKEND, label: 'Backend' },
  ],
  children: [
    {
      id: uid(),
      label: 'Frontend',
      status: 'fertig',
      ebene: null,
      segmentId: SEGMENT_FRONTEND,
      children: [
        { id: uid(), label: 'React Core', status: 'fertig', ebene: null, segmentId: SEGMENT_FRONTEND, children: [] },
        { id: uid(), label: 'Tailwind UI', status: 'später', ebene: null, segmentId: SEGMENT_FRONTEND, children: [] },
      ],
    },
    {
      id: uid(),
      label: 'Backend',
      status: 'jetzt',
      ebene: null,
      segmentId: SEGMENT_BACKEND,
      children: [
        { id: uid(), label: 'API Design', status: 'jetzt', ebene: null, segmentId: SEGMENT_BACKEND, children: [] },
        { id: uid(), label: 'DB Modeling', status: 'später', ebene: null, segmentId: SEGMENT_BACKEND, children: [] },
      ],
    },
  ],
}
