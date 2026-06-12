import { Router } from 'express'
import multer from 'multer'
import { parseClassResource } from '../services/parser.js'
import { generateNotes, generateNotesFromMedia, generateNotesFromVideoUrl } from '../services/llm.js'
import { fetchLinkContent } from '../services/linkFetcher.js'
import { extractPptxText } from '../services/pptxParser.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // serverless request body limit
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

function extractTitle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const heading = lines.find(l => l.startsWith('#'))
  const raw = heading ? heading.replace(/^#+\s*/, '') : (lines[0] ?? 'Untitled Note')
  return raw.slice(0, 60)
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

router.post('/generate', uploadSingle, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const { prompt, preset, link } = req.body

    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      process.env.GEMINI_API_KEY

    let structuredContent = ''
    let metadata = { segmentCount: 0, duration: 'N/A', topic: 'Uploaded Document', isPlainText: true }
    let stream

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
      stream = generateNotes(structuredContent, prompt, preset, apiKey)
    } else if (req.file && isLegacyPpt(req.file)) {
      throw new Error('Legacy .ppt files are not supported — please save as .pptx and try again.')
    } else if (req.file) {
      const fileContent = req.file.buffer.toString('utf-8')
      ;({ structuredContent, metadata } = parseClassResource(fileContent))
      stream = generateNotes(structuredContent, prompt, preset, apiKey)
    } else if (link) {
      const fetched = await fetchLinkContent(link)
      metadata = { segmentCount: 0, duration: 'N/A', topic: fetched.title, isPlainText: true }
      if (fetched.isYoutube) {
        stream = generateNotesFromVideoUrl(fetched.youtubeUrl, prompt, preset, apiKey)
      } else {
        structuredContent = fetched.content
        stream = generateNotes(structuredContent, prompt, preset, apiKey)
      }
    } else {
      throw new Error('No file, recording, or link provided')
    }

    let fullContent = ''

    for await (const chunk of stream) {
      fullContent += chunk
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({
      done: true,
      title: extractTitle(fullContent),
      segment_count: metadata.segmentCount,
      duration: metadata.duration,
    })}\n\n`)
    res.end()
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

export default router
