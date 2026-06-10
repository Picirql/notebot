const YOUTUBE_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; NoteBot/1.0; +https://ai-notebot.vercel.app)',
  'Accept-Language': 'en-US,en;q=0.9',
}
const MAX_CONTENT_LENGTH = 60000

// ── Public entry point ──────────────────────────────────────────────────────

export async function fetchLinkContent(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That doesn\'t look like a valid URL.')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.')
  }

  const ytId = url.match(YOUTUBE_RE)?.[1]
  if (ytId) {
    return {
      isYoutube: true,
      youtubeUrl: `https://www.youtube.com/watch?v=${ytId}`,
      title: `YouTube video (${ytId})`,
    }
  }

  return fetchPageText(url)
}

// ── Generic web pages ────────────────────────────────────────────────────────

async function fetchPageText(url) {
  let res
  try {
    res = await fetch(url, { headers: FETCH_HEADERS })
  } catch (err) {
    throw new Error(`Could not reach that link: ${err.message}`)
  }
  if (!res.ok) {
    throw new Error(`Link returned ${res.status} ${res.statusText}`)
  }

  const html = await res.text()
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url).trim()
  const text = htmlToText(html)

  if (!text) {
    throw new Error('Could not extract any readable text from that page.')
  }

  return { content: text.slice(0, MAX_CONTENT_LENGTH), title }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
