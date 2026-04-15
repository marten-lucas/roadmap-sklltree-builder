import React, { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MantineProvider } from '@mantine/core'
import { SkillTree } from '../SkillTree'

describe('SkillTree smoke render', () => {
  it('renders the full SkillTree without crashing', () => {
    expect(() => renderToString(
      createElement(MantineProvider, null, createElement(SkillTree)),
    )).not.toThrow()
  })
})
