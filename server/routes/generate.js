import { Router } from 'express'
import multer from 'multer'
import { GoogleGenAI } from '@google/genai'
import { parseClassResource } from '../services/parser.js'
import { generateNotes, generateNotesFromMedia, generateNotesFromVideoUrl, chunkMarkdown, extractChunkMetadata } from '../services/llm.js'
import { fetchLinkContent } from '../services/linkFetcher.js'
import { extractPptxText } from '../services/pptxParser.js'
import { getEmbedding } from '../services/embeddings.js'
import { upsertNoteChunks, queryNotebookContext, deleteNoteFromPinecone } from '../services/pinecone.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
})

const AUDIO_MIME_MAP = {
  'audio/mpeg': 'audio/mp3',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/wave': 'audio/wav',
  'audio/x-wav': 'audio/wav',
}
const AUDIO_EXT_MAP = { mp3: 'audio/mp3', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac' }

const VIDEO_MIME_MAP = {
  'video/quicktime': 'video/mov',
  'video/x-matroska': 'video/webm',
}
const VIDEO_EXT_MAP = { mp4: 'video/mp4', mov: 'video/mov', webm: 'video/webm', avi: 'video/avi', wmv: 'video/wmv', '3gp': 'video/3gpp', mpeg: 'video/mpeg', mpg: 'video/mpg' }

const PDF_MIME = 'application/pdf'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const PPT_MIME = 'application/vnd.ms-powerpoint'

function isPptx(file) {
  return file.mimetype === PPTX_MIME || /\.pptx$/i.test(file.originalname)
}

function isLegacyPpt(file) {
  return file.mimetype === PPT_MIME || /\.ppt$/i.test(file.originalname)
}

function normalizeAudioMime(mimetype, filename) {
  if (mimetype && AUDIO_MIME_MAP[mimetype]) return AUDIO_MIME_MAP[mimetype]
  if (mimetype && mimetype.startsWith('audio/')) return mimetype
  const ext = (filename.split('.').pop() || '').toLowerCase()
  return AUDIO_EXT_MAP[ext] || 'audio/mpeg'
}

function normalizeVideoMime(mimetype, filename) {
  if (mimetype && VIDEO_MIME_MAP[mimetype]) return VIDEO_MIME_MAP[mimetype]
  if (mimetype && mimetype.startsWith('video/')) return mimetype
  const ext = (filename.split('.').pop() || '').toLowerCase()
  return VIDEO_EXT_MAP[ext] || 'video/mp4'
}

function extractTitle(text, prompt) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const isIndexLike = bare =>
    /^index/i.test(bare) ||
    /^table\s+of\s+contents/i.test(bare) ||
    /^toc$/i.test(bare) ||
    /^contents$/i.test(bare)

  const stripMdLinks = s => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`]/g, '').trim()

  const heading = lines.find(l => {
    if (!l.startsWith('#')) return false
    const bare = l.replace(/^#+\s*/, '').trim()
    return !isIndexLike(bare)
  })

  if (heading) {
    const raw = stripMdLinks(heading.replace(/^#+\s*/, ''))
    if (raw.length > 2) return raw.slice(0, 60)
  }

  if (prompt?.trim()) return prompt.trim().slice(0, 60)

  const firstContent = lines.find(l => !l.startsWith('#') && l.length > 5)
  if (firstContent) {
    const raw = stripMdLinks(firstContent).replace(/^[-*>]\s*/, '')
    if (raw.length > 2) return raw.slice(0, 60)
  }

  return 'Untitled Note'
}

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next()
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 4MB).' : err.message
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  })
}

// ── Pinecone helpers ──────────────────────────────────────────────────────────

async function ingestNote(notebookId, noteId, fullContent, apiKey) {
  const rawChunks = chunkMarkdown(fullContent)
  const chunks = []
  for (const text of rawChunks) {
    const tags = await extractChunkMetadata(text, apiKey)
    chunks.push({ text, tags })
  }
  await upsertNoteChunks(notebookId, noteId, chunks)
  return chunks.length
}

async function ingestNoteBackground(notebookId, noteId, fullContent, apiKey) {
  try {
    const n = await ingestNote(notebookId, noteId, fullContent, apiKey)
    console.log(`[Pinecone] Ingested ${n} chunk(s) for note ${noteId}`)
  } catch (err) {
    console.error('[Pinecone ingest error]', err.message)
  }
}

async function fetchPriorContext(notebookId, queryText, apiKey) {
  try {
    const vec = await getEmbedding(queryText, apiKey)
    const matches = await queryNotebookContext(notebookId, vec, 3)
    if (!matches.length) return ''
    const blocks = matches.map(m => m.metadata?.text ?? '').filter(Boolean)
    return [
      '\n\n---',
      'Prior references from this notebook (use to ensure consistency and build on prior knowledge):',
      blocks.join('\n\n'),
      '---\n\n',
    ].join('\n')
  } catch {
    return ''
  }
}

// ── POST /api/generate ────────────────────────────────────────────────────────

router.post('/generate', uploadSingle, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const { prompt, preset, link, notebookId } = req.body

    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      process.env.GEMINI_API_KEY

    // Generate a stable noteId on the server so both ingestion and the client use the same value
    const noteId = Date.now()

    let structuredContent = ''
    let metadata = { segmentCount: 0, duration: 'N/A', topic: 'Uploaded Document', isPlainText: true }
    let stream
    let isTextBased = false

    if (req.file && req.file.mimetype?.startsWith('audio/')) {
      const mimeType = normalizeAudioMime(req.file.mimetype, req.file.originalname)
      metadata.topic = 'Audio Recording'
      stream = generateNotesFromMedia(req.file.buffer, mimeType, prompt, preset, apiKey)
    } else if (req.file && req.file.mimetype?.startsWith('video/')) {
      const mimeType = normalizeVideoMime(req.file.mimetype, req.file.originalname)
      metadata.topic = 'Video'
      stream = generateNotesFromMedia(req.file.buffer, mimeType, prompt, preset, apiKey)
    } else if (req.file && req.file.mimetype === PDF_MIME) {
      metadata.topic = 'PDF Document'
      stream = generateNotesFromMedia(req.file.buffer, PDF_MIME, prompt, preset, apiKey)
    } else if (req.file && isPptx(req.file)) {
      structuredContent = await extractPptxText(req.file.buffer)
      metadata.topic = 'PowerPoint Presentation'
      isTextBased = true
    } else if (req.file && isLegacyPpt(req.file)) {
      throw new Error('Legacy .ppt files are not supported — please save as .pptx and try again.')
    } else if (req.file) {
      const fileContent = req.file.buffer.toString('utf-8')
      ;({ structuredContent, metadata } = parseClassResource(fileContent))
      isTextBased = true
    } else if (link) {
      const fetched = await fetchLinkContent(link)
      metadata = { segmentCount: 0, duration: 'N/A', topic: fetched.title, isPlainText: true }
      if (fetched.isYoutube) {
        stream = generateNotesFromVideoUrl(fetched.youtubeUrl, prompt, preset, apiKey)
      } else {
        structuredContent = fetched.content
        isTextBased = true
      }
    } else {
      throw new Error('No file, recording, or link provided')
    }

    // 5.3 — Inject prior knowledge from Pinecone for text-based generation
    if (isTextBased && notebookId) {
      const queryText = prompt?.trim() || metadata.topic
      const priorContext = await fetchPriorContext(notebookId, queryText, apiKey)
      if (priorContext) structuredContent = priorContext + structuredContent
      stream = generateNotes(structuredContent, prompt, preset, apiKey)
    } else if (isTextBased) {
      stream = generateNotes(structuredContent, prompt, preset, apiKey)
    }

    let fullContent = ''

    for await (const chunk of stream) {
      fullContent += chunk
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({
      done: true,
      noteId,
      title: extractTitle(fullContent, prompt),
      segment_count: metadata.segmentCount,
      duration: metadata.duration,
    })}\n\n`)
    res.end()

    // 5.1 — Background ingestion into Pinecone (non-blocking)
    if (notebookId) {
      ingestNoteBackground(notebookId, noteId, fullContent, apiKey)
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

// ── POST /api/chat ────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const { notebookId, message } = req.body
    if (!notebookId || !message) throw new Error('notebookId and message are required')

    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('API key missing')

    const queryVec = await getEmbedding(message, apiKey)
    const matches = await queryNotebookContext(notebookId, queryVec, 5)
    const context = matches
      .map(m => m.metadata?.text ?? '')
      .filter(Boolean)
      .join('\n\n')

    const systemInstruction = [
      'You are a personal tutor helping a student revise. Use the provided notebook context as your primary reference — always ground your answer in it.',
      'You may elaborate beyond the notes to give deeper explanations, examples, or intuition, but stay on the same topic. Do not invent facts that contradict the notes.',
      'If the topic is completely absent from the notes and unrelated to the notebook subject, politely say so and offer to stick to what the notebook covers.',
      '',
      'Notebook context:',
      context || '(No relevant notes found in this notebook yet — ask the student to sync their notes first.)',
    ].join('\n')

    const ai = new GoogleGenAI({ apiKey })
    const stream = await ai.models.generateContentStream({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: message }] }],
      config: { systemInstruction },
    })

    for await (const chunk of stream) {
      if (chunk.text) res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

// ── POST /api/sync ────────────────────────────────────────────────────────────

router.post('/sync', async (req, res) => {
  try {
    const { notebookId, notes } = req.body
    if (!notebookId || !Array.isArray(notes)) {
      return res.status(400).json({ error: 'notebookId and notes[] are required' })
    }
    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      process.env.GEMINI_API_KEY

    let totalChunks = 0
    for (const note of notes) {
      if (!note.content?.trim()) continue
      const n = await ingestNote(notebookId, note.id, note.content, apiKey)
      console.log(`[Pinecone] Synced note ${note.id}: ${n} chunks`)
      totalChunks += n
    }
    res.json({ ok: true, totalChunks })
  } catch (err) {
    console.error('[Sync error]', err)
    res.status(500).json({ error: err.message })
  }
})

// ── DELETE /api/notes/:noteId/vectors ─────────────────────────────────────────

router.delete('/notes/:noteId/vectors', async (req, res) => {
  try {
    await deleteNoteFromPinecone(req.params.noteId)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
