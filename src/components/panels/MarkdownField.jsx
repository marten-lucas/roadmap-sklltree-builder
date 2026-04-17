import { ActionIcon, Group, Modal, Stack, Text, Textarea } from '@mantine/core'
import { useRef, useState } from 'react'
import { IconArrowsMaximize, IconArrowsMinimize, IconBold, IconHeading, IconLink, IconList, IconItalic } from '@tabler/icons-react'
import { applyMarkdownFormatting } from '../utils/markdown'
import { Tooltip } from '../tooltip'

const toolbarActions = [
  { action: 'bold', label: 'Fett', icon: IconBold },
  { action: 'italic', label: 'Kursiv', icon: IconItalic },
  { action: 'link', label: 'Link', icon: IconLink },
  { action: 'list', label: 'Liste', icon: IconList },
  { action: 'header', label: 'Heading', icon: IconHeading },
]

const fillTextareaStyles = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  wrapper: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  input: { flex: 1, resize: 'none', height: 'auto' },
}

const fullscreenTextareaStyles = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  wrapper: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
  input: {
    flex: 1,
    resize: 'none',
    minHeight: '100%',
    height: '100%',
    fontSize: '1.2rem',
    lineHeight: 1.7,
    padding: '14px 16px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
}

export function MarkdownField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 4,
  autosize = true,
  description,
  fill = false,
}) {
  const textareaRef = useRef(null)
  const fullscreenTextareaRef = useRef(null)
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)

  const applyAction = (action, targetRef = textareaRef) => {
    const textarea = targetRef.current
    if (!textarea) {
      return
    }

    const result = applyMarkdownFormatting(textarea.value, textarea.selectionStart, textarea.selectionEnd, action)
    if (!result) {
      return
    }

    onChange?.(result.value)

    window.requestAnimationFrame(() => {
      const activeTextarea = targetRef.current
      if (!activeTextarea) {
        return
      }

      activeTextarea.focus()
      activeTextarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }

  const closeFullscreenEditor = () => {
    setIsFullscreenOpen(false)
    onBlur?.()
  }

  const renderToolbar = (targetRef, showExpandButton = false, iconSize = 'sm', glyphSize = 14) => (
    <Group gap={4} wrap="nowrap">
      {toolbarActions.map((entry) => {
        const Icon = entry.icon

        return (
          <Tooltip key={entry.action} label={entry.label}>
            <ActionIcon
              variant="light"
              color="gray"
              size={iconSize}
              aria-label={entry.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyAction(entry.action, targetRef)}
            >
              <Icon size={glyphSize} stroke={2} />
            </ActionIcon>
          </Tooltip>
        )
      })}

      {showExpandButton ? (
        <Tooltip label="Open large markdown editor">
          <ActionIcon
            variant="light"
            color="blue"
            size={iconSize}
            aria-label="Open large markdown editor"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setIsFullscreenOpen(true)}
          >
            <IconArrowsMaximize size={glyphSize} stroke={2} />
          </ActionIcon>
        </Tooltip>
      ) : null}
    </Group>
  )

  return (
    <>
      <Stack gap={8} style={fill ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 } : undefined}>
        <Group justify="space-between" align="center" gap="sm">
          <Text component="label" size="sm" className="mantine-dark-label">
            {label}
          </Text>
          {renderToolbar(textareaRef, true)}
        </Group>

        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          onBlur={onBlur}
          minRows={minRows}
          autosize={fill ? false : autosize}
          styles={fill ? fillTextareaStyles : undefined}
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

      <Modal
        opened={isFullscreenOpen}
        onClose={closeFullscreenEditor}
        centered
        size="60vw"
        withCloseButton={false}
        padding="md"
        styles={{
          content: {
            background: '#0f172a',
            width: '60vw',
            maxWidth: '60vw',
          },
          body: { height: '60vh', display: 'flex', flexDirection: 'column', padding: '16px' },
        }}
      >
        <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
          <Group justify="space-between" align="center" gap="sm">
            <div style={{ minWidth: 0 }}>
              <Text fw={700} style={{ color: '#e2e8f0' }}>{label}</Text>
              <Text size="sm" c="dimmed">Markdown editor</Text>
            </div>
            <Group gap={6} wrap="nowrap">
              {renderToolbar(fullscreenTextareaRef, false, 'lg', 18)}
              <Tooltip label="Close large markdown editor">
                <ActionIcon
                  variant="light"
                  color="gray"
                  size="lg"
                  aria-label="Close large markdown editor"
                  onClick={closeFullscreenEditor}
                >
                  <IconArrowsMinimize size={18} stroke={2} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Textarea
            ref={fullscreenTextareaRef}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange?.(event.currentTarget.value)}
            onBlur={onBlur}
            minRows={Math.max(minRows, 18)}
            autosize={false}
            styles={fullscreenTextareaStyles}
            classNames={{
              input: 'mantine-dark-input skill-panel__markdown-input',
              label: 'mantine-dark-label',
            }}
          />
        </Stack>
      </Modal>
    </>
  )
}

export default MarkdownField