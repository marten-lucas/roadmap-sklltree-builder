import { createTheme } from '@mantine/core'
import { TOOLTIP_THEME_STYLES } from './components/tooltip/tooltipStyles'

export const appTheme = createTheme({
  components: {
    Tooltip: {
      defaultProps: {
        withArrow: false,
      },
      styles: {
        tooltip: TOOLTIP_THEME_STYLES,
      },
    },
  },
})

export default appTheme