import JSZip from 'jszip'

const MAX_CONTENT_LENGTH = 60000

export async function extractPptxText(buffer) {
  let zip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('Could not read that file as a PowerPoint (.pptx) document.')
  }

  const slideFiles = Object.keys(zip.files)
    .map(name => ({ name, num: Number(name.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter(f => !Number.isNaN(f.num))
    .sort((a, b) => a.num - b.num)

  if (!slideFiles.length) {
    throw new Error('No slides found in that PowerPoint file.')
  }

  const slides = []
  for (const { name, num } of slideFiles) {
    const xml = await zip.files[name].async('string')
    const text = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
      .map(m => decodeXmlEntities(m[1]))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) slides.push(`Slide ${num}: ${text}`)
  }

  const content = slides.join('\n\n')
  if (!content) {
    throw new Error('Could not extract any text from that PowerPoint file.')
  }

  return content.slice(0, MAX_CONTENT_LENGTH)
}

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}
