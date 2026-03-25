import { createTheme } from '@mantine/core'
import { TOOLTIP_ARROW_BORDER_COLOR, TOOLTIP_THEME_STYLES } from './components/tooltip/tooltipStyles'

export const appTheme = createTheme({
  components: {
    Tooltip: {
      defaultProps: {
        withArrow: true,
      },
      styles: {
        tooltip: TOOLTIP_THEME_STYLES,
        arrow: {
          borderColor: TOOLTIP_ARROW_BORDER_COLOR,
        },
      },
    },
  },
})

export default appTheme