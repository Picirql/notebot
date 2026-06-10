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
  const instruction = mimeType.startsWith('video/')
    ? 'Watch this video, then turn it into study notes following the instructions.'
    : 'Transcribe this class recording, then turn it into study notes following the instructions.'

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
