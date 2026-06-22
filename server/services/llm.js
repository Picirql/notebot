import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'
import { buildPrompt } from './prompts.js'

const MODEL = 'gemini-2.5-flash'
const OPENAI_COMPAT_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

export async function* generateNotes(structuredContent, prompt, preset, apiKey) {
  const clientKey = apiKey || process.env.GEMINI_API_KEY
  if (!clientKey) {
    throw new Error('Gemini API Key is missing. Please configure it in the settings panel (⚙) or add GEMINI_API_KEY to your environment variables.')
  }

  const systemInstruction = buildPrompt(preset, prompt)

  let response
  try {
    response = await fetch(OPENAI_COMPAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user',   content: structuredContent },
        ],
      }),
    })
  } catch (err) {
    throw new Error(`Network error reaching Gemini: ${err.message}`)
  }

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errText}`)
  }

  // Parse OpenAI-style SSE: data: {"choices":[{"delta":{"content":"..."}}]}
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6).trim()
        if (!data || data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const text = parsed.choices?.[0]?.delta?.content
          if (text) yield text
        } catch { /* skip malformed chunks */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function* generateNotesFromMedia(mediaBuffer, mimeType, prompt, preset, apiKey) {
  const clientKey = apiKey || process.env.GEMINI_API_KEY
  if (!clientKey) {
    throw new Error('Gemini API Key is missing. Please configure it in the settings panel (⚙) or add GEMINI_API_KEY to your environment variables.')
  }

  const systemInstruction = buildPrompt(preset, prompt)
  const ai = new GoogleGenAI({ apiKey: clientKey })
  let instruction
  if (mimeType.startsWith('video/')) {
    instruction = 'Watch this video, then turn it into study notes following the instructions.'
  } else if (mimeType === 'application/pdf') {
    instruction = 'Read this document, then turn it into study notes following the instructions.'
  } else {
    instruction = 'Transcribe this class recording, then turn it into study notes following the instructions.'
  }

  let stream
  try {
    stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: instruction },
          { inlineData: { mimeType, data: mediaBuffer.toString('base64') } },
        ],
      }],
      config: { systemInstruction },
    })
  } catch (err) {
    throw new Error(`Gemini API error: ${err.message}`)
  }

  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text
  }
}

// ── Chunking ──────────────────────────────────────────────────────────────────

function splitLongSection(text) {
  const lines = text.split('\n')
  const chunks = []
  let current = ''
  let inCode = false
  let inMath = false

  for (const line of lines) {
    if (line.trim().startsWith('```')) inCode = !inCode
    const mathTicks = (line.match(/\$\$/g) ?? []).length
    if (mathTicks % 2 !== 0) inMath = !inMath

    current += line + '\n'

    if (current.length >= 1000 && !inCode && !inMath) {
      chunks.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export function chunkMarkdown(text) {
  const sections = text.split(/^(?=##\s)/m).filter(s => s.trim())
  const chunks = []
  for (const section of sections) {
    if (section.length <= 1000) {
      chunks.push(section.trim())
    } else {
      chunks.push(...splitLongSection(section))
    }
  }
  return chunks.filter(Boolean)
}

// ── Metadata tagging ──────────────────────────────────────────────────────────

const TAG_SYSTEM = `Analyze the provided note chunk. Output a valid JSON object tagging the chunk with these fields:
- subject: Subject area (e.g. "Mathematics", "Physics")
- chapter_topic: Name of chapter/topic
- type: Must be exactly one of: "theory", "formula", "worked example", "teacher-emphasis"
- importance: boolean (true if marked "important", "frequent exam question", or similar, else false)
Return ONLY a raw JSON object matching this schema. Do not enclose it in markdown blocks.`

export async function extractChunkMetadata(chunkText, apiKey) {
  const clientKey = apiKey || process.env.GEMINI_API_KEY
  const defaultTags = { subject: '', chapter_topic: '', type: 'theory', importance: false }
  if (!clientKey) return defaultTags

  try {
    const ai = new GoogleGenAI({ apiKey: clientKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: chunkText }] }],
      config: { systemInstruction: TAG_SYSTEM },
    })

    const raw = (response.text ?? '').trim()
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return defaultTags
  }
}

export async function* generateNotesFromVideoUrl(videoUrl, prompt, preset, apiKey) {
  const clientKey = apiKey || process.env.GEMINI_API_KEY
  if (!clientKey) {
    throw new Error('Gemini API Key is missing. Please configure it in the settings panel (⚙) or add GEMINI_API_KEY to your environment variables.')
  }

  const systemInstruction = buildPrompt(preset, prompt)
  const ai = new GoogleGenAI({ apiKey: clientKey })

  let stream
  try {
    stream = await ai.models.generateContentStream({
      model: MODEL,
      contents: [{
        role: 'user',
        parts: [
          { text: 'Watch this video, then turn it into study notes following the instructions.' },
          { fileData: { fileUri: videoUrl } },
        ],
      }],
      config: { systemInstruction },
    })
  } catch (err) {
    throw new Error(`Gemini API error: ${err.message}`)
  }

  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text
  }
}
