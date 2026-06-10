function parseTimestamp(ts) {
  const parts = ts.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'it', 'its', 'this', 'that', 'are', 'was',
  'were', 'be', 'been', 'as', 'from', 'not', 'we', 'can', 'has', 'have',
])

function inferTopic(segments) {
  const wordCount = {}
  for (const seg of segments) {
    const words = seg.noteTitle
      .toLowerCase()
      .split(/\W+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1
    }
  }
  const entries = Object.entries(wordCount)
  if (entries.length === 0) return segments[0].noteTitle
  return entries
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function groupConsecutive(segments) {
  const groups = []
  for (const seg of segments) {
    const last = groups[groups.length - 1]
    if (last && last.sectionTitle === seg.sectionTitle) {
      last.segments.push(seg)
    } else {
      groups.push({ sectionTitle: seg.sectionTitle, segments: [seg] })
    }
  }
  return groups
}

export function parseClassResource(fileContent) {
  let parsed
  try {
    parsed = JSON.parse(fileContent)
  } catch {
    return {
      structuredContent: fileContent,
      metadata: { segmentCount: 0, duration: 'N/A', topic: 'Uploaded Document', isPlainText: true },
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      structuredContent: fileContent,
      metadata: { segmentCount: 0, duration: 'N/A', topic: 'Uploaded Document', isPlainText: true },
    }
  }

  const segments = [...parsed].sort(
    (a, b) => parseTimestamp(a.timeStamp) - parseTimestamp(b.timeStamp)
  )

  const firstSeconds = parseTimestamp(segments[0].timeStamp)
  const lastSeconds = parseTimestamp(segments[segments.length - 1].endTimeStamp)
  const duration = lastSeconds > firstSeconds
    ? formatDuration(lastSeconds - firstSeconds)
    : formatDuration(lastSeconds)

  const topic = inferTopic(segments)
  const types = [...new Set(segments.map(s => s.type).filter(Boolean))]
  const groups = groupConsecutive(segments)

  const lines = [`# Class Resource: ${topic}`, '']

  for (const group of groups) {
    lines.push(`## ${group.sectionTitle}`, '')
    for (const seg of group.segments) {
      const type = (seg.type || 'NOTE').toUpperCase()
      lines.push(`[${type}] ${seg.noteTitle} (${seg.timeStamp} - ${seg.endTimeStamp})`)
      lines.push('')
      lines.push(seg.markdown)
      lines.push('')
    }
  }

  return {
    structuredContent: lines.join('\n'),
    metadata: {
      segmentCount: segments.length,
      duration,
      topic,
      types,
      isPlainText: false,
    },
  }
}
