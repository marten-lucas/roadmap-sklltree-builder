const uid = () => crypto.randomUUID()

export const initialData = {
  // Synthetic container only; not rendered as a selectable node.
  children: [
    {
      id: uid(),
      label: 'Frontend',
      status: 'fertig',
      ebene: null,
      children: [
        { id: uid(), label: 'React Core', status: 'fertig', ebene: null, children: [] },
        { id: uid(), label: 'Tailwind UI', status: 'später', ebene: null, children: [] },
      ],
    },
    {
      id: uid(),
      label: 'Backend',
      status: 'jetzt',
      ebene: null,
      children: [
        { id: uid(), label: 'API Design', status: 'jetzt', ebene: null, children: [] },
        { id: uid(), label: 'DB Modeling', status: 'später', ebene: null, children: [] },
      ],
    },
  ],
}
