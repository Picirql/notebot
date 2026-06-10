import { Router } from 'express'
import multer from 'multer'
import { parseClassResource } from '../services/parser.js'
import { generateNotes } from '../services/llm.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

function extractTitle(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const heading = lines.find(l => l.startsWith('#'))
  const raw = heading ? heading.replace(/^#+\s*/, '') : (lines[0] ?? 'Untitled Note')
  return raw.slice(0, 60)
}

router.post('/generate', upload.single('file'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const fileContent = req.file ? req.file.buffer.toString('utf-8') : ''
    const { prompt, preset } = req.body
    const { structuredContent, metadata } = parseClassResource(fileContent)

    const apiKey =
      req.headers['x-api-key'] ||
      req.headers['authorization']?.replace('Bearer ', '') ||
      process.env.GEMINI_API_KEY

    let fullContent = ''

    for await (const chunk of generateNotes(structuredContent, prompt, preset, apiKey)) {
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
