import 'dotenv/config'

const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent'

export async function getEmbedding(text, callerApiKey) {
  const key = callerApiKey || process.env.GEMINI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY is not set')

  const body = JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 })

  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt))

    const res = await fetch(`${EMBED_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (res.ok) {
      const data = await res.json()
      return data.embedding.values
    }

    const err = await res.json().catch(() => ({}))
    lastErr = new Error(`Embedding API error: ${JSON.stringify(err)}`)
    // Only retry on transient errors (503, 429 with retry-after)
    if (res.status !== 503 && res.status !== 429) throw lastErr
  }

  throw lastErr
}
