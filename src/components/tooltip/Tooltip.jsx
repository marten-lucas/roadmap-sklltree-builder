import { Tooltip as MantineTooltip } from '@mantine/core'

const DEFAULT_TRANSITION_PROPS = { transition: 'fade', duration: 120 }

export function Tooltip({
  children,
  withArrow = true,
  openDelay = 120,
  transitionProps = DEFAULT_TRANSITION_PROPS,
  ...props
}) {
  return (
    <MantineTooltip
      withArrow={withArrow}
      openDelay={openDelay}
      transitionProps={transitionProps}
      {...props}
    >
      {children}
    </MantineTooltip>
  )
}

export default Tooltip