import { createTheme } from '@mantine/core'

export const appTheme = createTheme({
  components: {
    Tooltip: {
      defaultProps: {
        withArrow: true,
      },
      styles: {
        tooltip: {
          maxWidth: '20rem',
          padding: '0.7rem 0.8rem',
          color: '#e2e8f0',
          backgroundColor: 'rgba(2, 6, 23, 0.96)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          boxShadow: '0 18px 40px rgba(2, 6, 23, 0.45)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        },
        arrow: {
          borderColor: 'rgba(56, 189, 248, 0.25)',
        },
      },
    },
  },
})

export default appTheme