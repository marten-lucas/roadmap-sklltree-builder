import { ActionIcon, Group, Stack, Text, Textarea } from '@mantine/core'
import { useRef } from 'react'
import { IconBold, IconHeading, IconLink, IconList, IconItalic } from '@tabler/icons-react'
import { applyMarkdownFormatting } from '../utils/markdown'
import { Tooltip } from '../tooltip'

const toolbarActions = [
  { action: 'bold', label: 'Fett', icon: IconBold },
  { action: 'italic', label: 'Kursiv', icon: IconItalic },
  { action: 'link', label: 'Link', icon: IconLink },
  { action: 'list', label: 'Liste', icon: IconList },
  { action: 'header', label: 'Überschrift', icon: IconHeading },
]

export function MarkdownField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 4,
  autosize = true,
  description,
}) {
  const textareaRef = useRef(null)

  const applyAction = (action) => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const result = applyMarkdownFormatting(textarea.value, textarea.selectionStart, textarea.selectionEnd, action)
    if (!result) {
      return
    }

    onChange?.(result.value)

    window.requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  return (
    <Stack gap={8}>
      <Group justify="space-between" align="center" gap="sm">
        <Text component="label" size="sm" className="mantine-dark-label">
          {label}
        </Text>
        <Group gap={4} wrap="nowrap">
          {toolbarActions.map((entry) => {
            const Icon = entry.icon

            return (
              <Tooltip key={entry.action} label={entry.label}>
                <ActionIcon variant="light" color="gray" size="sm" aria-label={entry.label} onClick={() => applyAction(entry.action)}>
                  <Icon size={14} stroke={2} />
                </ActionIcon>
              </Tooltip>
            )
          })}
        </Group>
      </Group>

      <Textarea
        ref={textareaRef}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        onBlur={onBlur}
        minRows={minRows}
        autosize={autosize}
        classNames={{
          input: 'mantine-dark-input skill-panel__markdown-input',
          label: 'mantine-dark-label',
        }}
      />

      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
    </Stack>
  )
}

export default MarkdownField