export const initialData = {
  id: 'root',
  label: 'Skilltree',
  status: 'jetzt',
  children: [
    {
      id: 'frontend',
      label: 'Frontend',
      status: 'fertig',
      children: [
        { id: 'react-core', label: 'React Core', status: 'fertig', children: [] },
        { id: 'tailwind-ui', label: 'Tailwind UI', status: 'später', children: [] },
      ],
    },
    {
      id: 'backend',
      label: 'Backend',
      status: 'jetzt',
      children: [
        { id: 'api-design', label: 'API Design', status: 'jetzt', children: [] },
        { id: 'db-modeling', label: 'DB Modeling', status: 'später', children: [] },
      ],
    },
  ],
}
