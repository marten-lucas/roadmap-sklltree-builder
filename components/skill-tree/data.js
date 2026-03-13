const uid = () => crypto.randomUUID()

export const initialData = {
  id: uid(),
  label: 'Skilltree',
  status: 'jetzt',
  children: [
    {
      id: uid(),
      label: 'Frontend',
      status: 'fertig',
      children: [
        { id: uid(), label: 'React Core', status: 'fertig', children: [] },
        { id: uid(), label: 'Tailwind UI', status: 'später', children: [] },
      ],
    },
    {
      id: uid(),
      label: 'Backend',
      status: 'jetzt',
      children: [
        { id: uid(), label: 'API Design', status: 'jetzt', children: [] },
        { id: uid(), label: 'DB Modeling', status: 'später', children: [] },
      ],
    },
  ],
}
