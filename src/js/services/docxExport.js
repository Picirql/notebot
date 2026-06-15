import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

// Splits a line of markdown into TextRuns, handling **bold**, `code`, *italic* and [links](url).
function parseInline(text) {
  const runs = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|\[(.+?)\]\(.+?\))/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun(text.slice(lastIndex, match.index)))
    }
    if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], bold: true }))
    } else if (match[3] !== undefined) {
      runs.push(new TextRun({ text: match[3], font: 'Consolas' }))
    } else if (match[4] !== undefined) {
      runs.push(new TextRun({ text: match[4], italics: true }))
    } else {
      runs.push(new TextRun(match[5]))
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun(text.slice(lastIndex)))
  }

  return runs.length ? runs : [new TextRun('')]
}

export async function buildDocxBlob(markdown, title) {
  const lines = markdown.split('\n')
  const children = []
  let inCodeBlock = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      children.push(new Paragraph({ children: [new TextRun({ text: line, font: 'Consolas' })] }))
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      children.push(new Paragraph({
        heading: HEADING_LEVELS[headingMatch[1].length - 1],
        children: parseInline(headingMatch[2]),
      }))
      continue
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bulletMatch) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(bulletMatch[1]) }))
      continue
    }

    const numberedMatch = line.match(/^\s*(\d+\.)\s+(.*)$/)
    if (numberedMatch) {
      children.push(new Paragraph({ children: parseInline(`${numberedMatch[1]} ${numberedMatch[2]}`) }))
      continue
    }

    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }))
      continue
    }

    children.push(new Paragraph({ children: parseInline(line) }))
  }

  const doc = new Document({
    title: title || 'Notes',
    sections: [{ children }],
  })

  return Packer.toBlob(doc)
}
