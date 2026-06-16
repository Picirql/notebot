import { Document, Packer, Paragraph, TextRun, HeadingLevel, Bookmark, InternalHyperlink } from 'docx'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]

// Mirrors the GitHub-style slug algorithm used by the in-app markdown renderer.
function slugify(text, counts) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'

  const count = counts[base] || 0
  counts[base] = count + 1
  return count === 0 ? base : `${base}-${count}`
}

// Splits a line of markdown into runs, handling **bold**, `code`, *italic* and [links](url).
// `headingAnchors` is a queue of bookmark ids for "##" sections, consumed in order for
// every [text](#anchor) link encountered (these are the Index links).
function parseInline(text, headingAnchors) {
  const runs = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*|\[(.+?)\]\((.+?)\))/g
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
    } else if (match[6].startsWith('#')) {
      const anchor = headingAnchors.shift()
      if (anchor) {
        runs.push(new InternalHyperlink({
          anchor,
          children: [new TextRun({ text: match[5], style: 'Hyperlink' })],
        }))
      } else {
        runs.push(new TextRun(match[5]))
      }
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

  // Pass 1: assign a bookmark slug to every heading, in document order, using a shared
  // counter (matches the in-app renderer's per-render numbering for duplicate titles).
  const slugCounts = {}
  const headingSlugs = []
  const sectionSlugs = []
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (!m) continue
    const slug = slugify(m[2], slugCounts)
    headingSlugs.push(slug)
    if (m[1].length === 2) sectionSlugs.push(slug)
  }

  // Pass 2: build the document, consuming the queues built above.
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
      const slug = headingSlugs.shift()
      children.push(new Paragraph({
        heading: HEADING_LEVELS[headingMatch[1].length - 1],
        children: [new Bookmark({ id: slug, children: parseInline(headingMatch[2], sectionSlugs) })],
      }))
      continue
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (bulletMatch) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(bulletMatch[1], sectionSlugs) }))
      continue
    }

    const numberedMatch = line.match(/^\s*(\d+\.)\s+(.*)$/)
    if (numberedMatch) {
      children.push(new Paragraph({ children: parseInline(`${numberedMatch[1]} ${numberedMatch[2]}`, sectionSlugs) }))
      continue
    }

    if (!line.trim()) {
      children.push(new Paragraph({ text: '' }))
      continue
    }

    children.push(new Paragraph({ children: parseInline(line, sectionSlugs) }))
  }

  const doc = new Document({
    title: title || 'Notes',
    sections: [{ children }],
  })

  return Packer.toBlob(doc)
}
