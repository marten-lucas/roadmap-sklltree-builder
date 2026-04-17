const ESCAPE_RE = /[&<>"']/g

const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

const escapeHtml = (value) => String(value ?? '').replace(ESCAPE_RE, (character) => escapeMap[character] ?? character)

const sanitizeUrl = (value) => {
  const rawValue = String(value ?? '').trim()
  if (!rawValue) {
    return ''
  }

  if (/^(https?:|mailto:|tel:|\/|#)/i.test(rawValue)) {
    return rawValue
  }

  return ''
}

const decodeHtmlEntities = (value) => String(value ?? '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")

const normalizeInlineWhitespace = (value) => String(value ?? '')
  .replace(/\u00a0/g, ' ')
  .replace(/[\t\f\r ]+/g, ' ')
  .replace(/ *\n */g, '\n')
  .replace(/\s+([,.;!?])/g, '$1')

const normalizeMarkdownOutput = (value) => String(value ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\t ]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim()

const wrapMarkdown = (value, before, after = before) => {
  const text = normalizeInlineWhitespace(value).trim()
  return text ? `${before}${text}${after}` : ''
}

const fallbackConvertHtmlToMarkdown = (html) => {
  let text = String(html ?? '')
  if (!text.trim()) {
    return ''
  }

  text = text.replace(/<\s*br\s*\/?>/gi, '\n')
  text = text.replace(/<span[^>]*style=["'][^"']*font-weight\s*:\s*(?:bold|[5-9]00)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (_, content) => wrapMarkdown(fallbackConvertHtmlToMarkdown(content), '**'))
  text = text.replace(/<span[^>]*style=["'][^"']*font-style\s*:\s*italic[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, (_, content) => wrapMarkdown(fallbackConvertHtmlToMarkdown(content), '*'))
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, content) => wrapMarkdown(fallbackConvertHtmlToMarkdown(content), '**'))
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, content) => wrapMarkdown(fallbackConvertHtmlToMarkdown(content), '*'))
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url, content) => {
    const safeUrl = sanitizeUrl(url)
    const label = normalizeInlineWhitespace(fallbackConvertHtmlToMarkdown(content)).trim()
    return safeUrl && label ? `[${label}](${safeUrl})` : label
  })
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => `${'#'.repeat(Number(level))} ${normalizeInlineWhitespace(fallbackConvertHtmlToMarkdown(content)).trim()}\n\n`)
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, content) => `- ${normalizeInlineWhitespace(fallbackConvertHtmlToMarkdown(content)).trim()}\n`)
  text = text.replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
  text = text.replace(/<(p|div|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _tag, content) => `${normalizeInlineWhitespace(fallbackConvertHtmlToMarkdown(content)).trim()}\n\n`)
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, content) => `\n\n\`\`\`\n${decodeHtmlEntities(content).trim()}\n\`\`\`\n\n`)
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, content) => `\`${decodeHtmlEntities(content).trim()}\``)
  text = text.replace(/<[^>]+>/g, '')

  return normalizeMarkdownOutput(decodeHtmlEntities(text))
}

const convertHtmlNodeToMarkdown = (node) => {
  if (!node) {
    return ''
  }

  if (node.nodeType === 3) {
    return decodeHtmlEntities(node.textContent)
  }

  if (node.nodeType !== 1) {
    return ''
  }

  const tag = node.tagName.toLowerCase()
  const style = String(node.getAttribute('style') ?? '').toLowerCase()
  const childText = Array.from(node.childNodes ?? []).map(convertHtmlNodeToMarkdown).join('')

  if (tag === 'br') {
    return '\n'
  }

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    const text = normalizeInlineWhitespace(childText).trim()
    return text ? `${'#'.repeat(level)} ${text}\n\n` : ''
  }

  if (tag === 'a') {
    const safeUrl = sanitizeUrl(node.getAttribute('href'))
    const label = normalizeInlineWhitespace(childText).trim()
    return safeUrl && label ? `[${label}](${safeUrl})` : label
  }

  if (tag === 'code') {
    const text = normalizeInlineWhitespace(childText).trim()
    return text ? `\`${text}\`` : ''
  }

  if (tag === 'pre') {
    const text = decodeHtmlEntities(node.textContent ?? '').trim()
    return text ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n` : ''
  }

  if (tag === 'ul' || tag === 'ol') {
    const items = Array.from(node.children ?? [])
      .filter((child) => child.tagName?.toLowerCase() === 'li')
      .map((child, index) => {
        const prefix = tag === 'ol' ? `${index + 1}. ` : '- '
        const itemText = normalizeInlineWhitespace(Array.from(child.childNodes ?? []).map(convertHtmlNodeToMarkdown).join(''))
          .replace(/\n{2,}/g, '\n')
          .trim()

        if (!itemText) {
          return ''
        }

        const lines = itemText.split('\n')
        return lines.map((line, lineIndex) => `${lineIndex === 0 ? prefix : '  '}${line}`).join('\n')
      })
      .filter(Boolean)
      .join('\n')

    return items ? `${items}\n\n` : ''
  }

  if (tag === 'p' || tag === 'div' || tag === 'blockquote') {
    const text = normalizeInlineWhitespace(childText).trim()
    return text ? `${text}\n\n` : ''
  }

  let result = childText

  if ((tag === 'strong' || tag === 'b' || /font-weight\s*:\s*(bold|[5-9]00)/i.test(style)) && result.trim()) {
    result = wrapMarkdown(result, '**')
  }

  if ((tag === 'em' || tag === 'i' || /font-style\s*:\s*italic/i.test(style)) && result.trim()) {
    result = wrapMarkdown(result, '*')
  }

  return result
}

export const convertRichTextHtmlToMarkdown = (html) => {
  const rawHtml = String(html ?? '').trim()
  if (!rawHtml) {
    return ''
  }

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(rawHtml, 'text/html')
      const markdown = Array.from(doc.body?.childNodes ?? []).map(convertHtmlNodeToMarkdown).join('')
      return normalizeMarkdownOutput(markdown)
    } catch {
      // fall back to regex-based conversion
    }
  }

  return fallbackConvertHtmlToMarkdown(rawHtml)
}

export const insertMarkdownText = (value, selectionStart, selectionEnd, insertedText) => {
  const text = String(value ?? '')
  const insertValue = String(insertedText ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const nextValue = `${text.slice(0, start)}${insertValue}${text.slice(end)}`
  const cursor = start + insertValue.length

  return {
    value: nextValue,
    selectionStart: cursor,
    selectionEnd: cursor,
  }
}

const renderInlineMarkdown = (value) => {
  const escaped = escapeHtml(value)

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      const safeUrl = sanitizeUrl(url)
      if (!safeUrl) {
        return label
      }

      return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${label}</a>`
    })
}

const renderHeadingBlock = (line) => {
  const match = line.match(/^(#{1,6})\s+(.+)$/)
  if (!match) {
    return null
  }

  const level = Math.min(6, match[1].length)
  const content = renderInlineMarkdown(match[2])
  return `<h${level}>${content}</h${level}>`
}

export const renderMarkdownToHtml = (value) => {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim()

  if (!text) {
    return ''
  }

  const lines = text.split('\n')
  const blocks = []
  let currentParagraph = []
  let currentList = []

  const flushParagraph = () => {
    if (currentParagraph.length === 0) {
      return
    }

    const paragraphText = currentParagraph.join(' ')
    blocks.push(`<p>${renderInlineMarkdown(paragraphText).replace(/\n/g, '<br />')}</p>`)
    currentParagraph = []
  }

  const flushList = () => {
    if (currentList.length === 0) {
      return
    }

    blocks.push(`<ul>${currentList.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join('')}</ul>`)
    currentList = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const headingHtml = renderHeadingBlock(line)
    if (headingHtml) {
      flushParagraph()
      flushList()
      blocks.push(headingHtml)
      continue
    }

    const listMatch = line.match(/^[-*+]\s+(.+)$/)
    if (listMatch) {
      flushParagraph()
      currentList.push(listMatch[1])
      continue
    }

    flushList()
    currentParagraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks.join('\n')
}

const wrapSelection = (value, selectionStart, selectionEnd, before, after = before) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const selected = text.slice(start, end)
  const nextValue = `${text.slice(0, start)}${before}${selected || before}${after}${text.slice(end)}`
  const nextSelectionStart = start + before.length
  const nextSelectionEnd = nextSelectionStart + (selected || before).length

  return {
    value: nextValue,
    selectionStart: nextSelectionStart,
    selectionEnd: nextSelectionEnd,
  }
}

const wrapLinesAsList = (value, selectionStart, selectionEnd) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const selected = text.slice(start, end)
  const lines = selected ? selected.split('\n') : ['']
  const listText = lines.map((line) => `- ${line.replace(/^[-*+]\s+/, '')}`).join('\n')
  const nextValue = `${text.slice(0, start)}${listText}${text.slice(end)}`

  return {
    value: nextValue,
    selectionStart: start,
    selectionEnd: start + listText.length,
  }
}

const wrapSelectionAsHeading = (value, selectionStart, selectionEnd, level = 2) => {
  const text = String(value ?? '')
  const start = Math.max(0, selectionStart ?? 0)
  const end = Math.max(start, selectionEnd ?? start)
  const marker = '#'.repeat(Math.max(1, Math.min(6, level)))
  const selected = text.slice(start, end)

  if (selected.length === 0) {
    const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const lineEnd = text.indexOf('\n', start)
    const resolvedEnd = lineEnd === -1 ? text.length : lineEnd
    const currentLine = text.slice(lineStart, resolvedEnd).replace(/^#{1,6}\s+/, '')
    const headingText = `${marker} ${currentLine || 'Heading'}`
    const nextValue = `${text.slice(0, lineStart)}${headingText}${text.slice(resolvedEnd)}`

    return {
      value: nextValue,
      selectionStart: lineStart + headingText.length,
      selectionEnd: lineStart + headingText.length,
    }
  }

  const headingText = selected
    .split('\n')
    .map((line) => `${marker} ${line.replace(/^#{1,6}\s+/, '')}`)
    .join('\n')

  return {
    value: `${text.slice(0, start)}${headingText}${text.slice(end)}`,
    selectionStart: start,
    selectionEnd: start + headingText.length,
  }
}

export const applyMarkdownFormatting = (value, selectionStart, selectionEnd, action) => {
  switch (action) {
    case 'bold':
      return wrapSelection(value, selectionStart, selectionEnd, '**')
    case 'italic':
      return wrapSelection(value, selectionStart, selectionEnd, '*')
    case 'header':
      return wrapSelectionAsHeading(value, selectionStart, selectionEnd, 2)
    case 'list':
      return wrapLinesAsList(value, selectionStart, selectionEnd)
    case 'link': {
      const selected = String(value ?? '').slice(Math.max(0, selectionStart ?? 0), Math.max(selectionStart ?? 0, selectionEnd ?? selectionStart ?? 0)).trim() || 'link'
      const url = window.prompt('Link-Ziel eingeben', 'https://')?.trim() ?? ''
      if (!url) {
        return null
      }

      const start = Math.max(0, selectionStart ?? 0)
      const end = Math.max(start, selectionEnd ?? start)
      const nextValue = `${String(value ?? '').slice(0, start)}[${selected}](${url})${String(value ?? '').slice(end)}`

      return {
        value: nextValue,
        selectionStart: start + 1,
        selectionEnd: start + 1 + selected.length,
      }
    }
    default:
      return null
  }
}

export const getMarkdownPreviewHtml = (value) => renderMarkdownToHtml(value)
