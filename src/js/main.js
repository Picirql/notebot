import * as fileUpload from './components/fileUpload.js'
import * as promptInput from './components/promptInput.js'
import * as noteViewer from './components/noteViewer.js'
import * as sidebar from './components/sidebar.js'
import { showToast } from './components/toast.js'
import * as api from './services/api.js'
import { renderMarkdown } from './services/markdown.js'

// ── App state ────────────────────────────────────────────────────────────────
let currentFile = null
let currentFileContent = null
let currentLinkUrl = null
let currentMetadata = null
let currentNoteId = null
let currentView = 'landing' // 'landing' | 'workspace'

// ── Render layout ────────────────────────────────────────────────────────────
document.getElementById('app').innerHTML = `
  <div class="app-layout">
    ${sidebar.render()}
    <main class="main-content">
      <div class="main-inner">
        <div id="view-landing">
          ${fileUpload.render()}
        </div>
        <div id="view-workspace" class="hidden">
          ${promptInput.render()}
          ${noteViewer.render()}
        </div>
      </div>
    </main>
  </div>
  <div class="toast-container"></div>
`

// ── Init components ──────────────────────────────────────────────────────────
sidebar.init(onNoteSelect, onNoteDelete, onHome)
fileUpload.init(onFileLoaded, onCapturedInput)
promptInput.init(onGenerate)
noteViewer.init()
setView('landing')

document.getElementById('btn-save')?.addEventListener('click', () => {
  if (currentNoteId) showToast('Note is already saved!', 'success')
})

// ── Startup: populate sidebar ────────────────────────────────────────────────
sidebar.loadNotes(api.fetchNotes())

// ── View coordination ────────────────────────────────────────────────────────
// 'landing'   → sidebar + upload container, note viewer hidden
// 'workspace' → sidebar + prompt input + note content viewer, upload container hidden

function setView(view) {
  currentView = view
  document.getElementById('view-landing')?.classList.toggle('hidden', view !== 'landing')
  document.getElementById('view-workspace')?.classList.toggle('hidden', view !== 'workspace')
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function onNoteSelect(noteId) {
  try {
    const note = api.fetchNote(noteId)
    noteViewer.show()
    noteViewer.clear()
    noteViewer.setContent(renderMarkdown(note.content))
    noteViewer.setRawContent(note.content)
    noteViewer.setBreadcrumb(note.source_file || note.title)
    noteViewer.finishStreaming()
    currentNoteId = noteId
    setSaveBtn('hidden')
    sidebar.setActive(noteId)
    setView('workspace')
  } catch (err) {
    showToast(`Failed to load note: ${err.message}`, 'error')
  }
}

function onHome() {
  noteViewer.hide()
  noteViewer.clear()
  currentNoteId = null
  setSaveBtn('hidden')
  setView('landing')
  document.querySelector('.main-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

function onNoteDelete(deletedId) {
  if (currentNoteId === deletedId) {
    noteViewer.hide()
    noteViewer.clear()
    currentNoteId = null
  }
}

function onFileLoaded(file, content) {
  currentLinkUrl = null
  if (!file) {
    currentFile = null
    currentFileContent = null
    currentMetadata = null
    promptInput.setEnabled(false)
    return
  }
  currentFile = file
  currentFileContent = content
  currentMetadata = extractClientMetadata(content)
  fileUpload.updateUploadInfo(file.name, currentMetadata)
  promptInput.setEnabled(true)
  setView('workspace')
}

// ── Captured input handling ─────────────────────────────────────────────────
// The Text option tile doesn't produce a real file, so we wrap it in a mock
// File the same way a real upload would arrive. Link is sent to the server as
// a URL to fetch; Recording sends the real audio file for transcription.

function onCapturedInput(kind, data) {
  if (kind === 'link') {
    currentFile = null
    currentFileContent = null
    currentLinkUrl = data
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Web Link', isPlainText: true }
    fileUpload.updateUploadInfo(data, currentMetadata)
    promptInput.setEnabled(true)
    setView('workspace')
    return
  }

  if (kind === 'recording') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Audio Recording', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
    setView('workspace')
    return
  }

  if (kind === 'video') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Video', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
    setView('workspace')
    return
  }

  if (kind === 'document') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Document', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
    setView('workspace')
    return
  }

  // 'text'
  const mockFile = new File([data], 'input.txt', { type: 'text/plain' })
  onFileLoaded(mockFile, data)
}

async function onGenerate(prompt, preset) {
  if (!currentFile && !currentLinkUrl) {
    showToast('Please upload a class resource, link, or recording first', 'error')
    return
  }

  const sourceLabel = currentFile ? currentFile.name : currentLinkUrl

  promptInput.setLoading(true)
  noteViewer.clear()
  noteViewer.show()
  noteViewer.setBreadcrumb(sourceLabel)
  currentNoteId = null
  sidebar.setActive(null)
  setSaveBtn('pending')

  let rawAccumulated = ''
  let cursorInjected = false
  let lastRender = 0
  const RENDER_INTERVAL = 150 // ms — throttle re-renders so large docs don't freeze the tab

  try {
    const stream = await api.generateNotes(currentFile, prompt, preset, currentLinkUrl)

    await readSSE(stream, (chunk) => {
      if (chunk.error) {
        showToast(`Generation error: ${chunk.error}`, 'error')
        return
      }

      if (chunk.text) {
        rawAccumulated += chunk.text
        const now = Date.now()
        if (now - lastRender >= RENDER_INTERVAL) {
          lastRender = now
          noteViewer.setContent(renderMarkdown(rawAccumulated))
          if (!cursorInjected) {
            const el = document.getElementById('note-content')
            if (el) {
              const cursor = document.createElement('span')
              cursor.className = 'streaming-cursor'
              el.appendChild(cursor)
            }
            cursorInjected = true
          }
        }
      }

      if (chunk.done) {
        // Final render with complete markdown before saving/exporting.
        noteViewer.setContent(renderMarkdown(rawAccumulated))

        const savedNote = api.saveNote({
          title: chunk.title,
          content: rawAccumulated,
          source_file: sourceLabel,
          prompt: prompt || null,
          preset: preset || null,
          segment_count: chunk.segment_count,
          duration: chunk.duration,
        })

        currentNoteId = savedNote.id
        noteViewer.setRawContent(rawAccumulated)
        noteViewer.finishStreaming()
        setSaveBtn('saved')
        sidebar.setActive(savedNote.id)
        sidebar.loadNotes(api.fetchNotes())
        sidebar.setActive(savedNote.id)
        showToast(`Notes saved locally: "${savedNote.title}"`, 'success')
      }
    })
  } catch (err) {
    noteViewer.finishStreaming()
    showToast(`Generation failed: ${err.message}`, 'error')
  } finally {
    promptInput.setLoading(false)
  }
}

// ── SSE stream parser ────────────────────────────────────────────────────────

async function readSSE(readableStream, onChunk) {
  const reader = readableStream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() // keep any incomplete trailing line

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6).trim()
        if (!payload) continue
        try {
          onChunk(JSON.parse(payload))
        } catch { /* skip malformed JSON */ }
      }
    }

    // Flush remaining buffer after stream closes
    const remaining = buffer.trim()
    if (remaining.startsWith('data: ')) {
      const payload = remaining.slice(6).trim()
      if (payload) {
        try { onChunk(JSON.parse(payload)) } catch { /* ignore */ }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Save button state ────────────────────────────────────────────────────────

function setSaveBtn(state) {
  const btn = document.getElementById('btn-save')
  if (!btn) return
  btn.classList.remove('hidden')
  btn.disabled = true
  switch (state) {
    case 'saved':
      btn.textContent = '✓ Saved'
      break
    case 'pending':
      btn.textContent = '💾 Save'
      break
    case 'hidden':
      btn.classList.add('hidden')
      break
  }
}

// ── Client-side metadata extraction ──────────────────────────────────────────
// Mirrors the server parser logic so the UI can show a preview before generation.

function extractClientMetadata(content) {
  try {
    const arr = JSON.parse(content)
    if (!Array.isArray(arr) || !arr.length) throw new Error('not an array')

    const sorted = [...arr].sort((a, b) => parseTs(a.timeStamp) - parseTs(b.timeStamp))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const durSec = parseTs(last.endTimeStamp) - parseTs(first.timeStamp)

    const rawTitle = first.noteTitle ?? ''
    const topic = rawTitle.includes(':')
      ? rawTitle.split(':').slice(1).join(':').trim()
      : rawTitle || 'Class Resource'

    return {
      segmentCount: arr.length,
      duration: durSec > 0 ? fmtSec(durSec) : 'N/A',
      topic,
      isPlainText: false,
    }
  } catch {
    return { segmentCount: 0, duration: 'N/A', topic: 'Uploaded Document', isPlainText: true }
  }
}

function parseTs(ts) {
  if (!ts) return 0
  const parts = String(ts).split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

// ── Settings modal ────────────────────────────────────────────────────────────

function initSettings() {
  const modal    = document.getElementById('settings-modal')
  const input    = document.getElementById('settings-api-key')
  const toggle   = document.getElementById('settings-toggle')
  const saveBtn  = document.getElementById('settings-save')
  const cancelBtn= document.getElementById('settings-cancel')
  const closeBtn = document.getElementById('settings-close')
  const openBtn  = document.getElementById('btn-settings')
  const status   = document.getElementById('settings-status')

  function openModal() {
    const stored = localStorage.getItem('gemini_api_key') || ''
    input.value = stored
    input.type = 'password'
    toggle.textContent = 'Show'
    status.textContent = stored ? 'A key is currently saved.' : ''
    modal.classList.remove('hidden')
    input.focus()
  }

  function closeModal() {
    modal.classList.add('hidden')
  }

  openBtn?.addEventListener('click', openModal)
  closeBtn?.addEventListener('click', closeModal)
  cancelBtn?.addEventListener('click', closeModal)
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

  toggle?.addEventListener('click', () => {
    const hide = input.type === 'text'
    input.type = hide ? 'password' : 'text'
    toggle.textContent = hide ? 'Show' : 'Hide'
  })

  saveBtn?.addEventListener('click', () => {
    const val = input.value.trim()
    if (val) {
      localStorage.setItem('gemini_api_key', val)
      showToast('API key saved to browser storage', 'success')
    } else {
      localStorage.removeItem('gemini_api_key')
      showToast('API key cleared', 'success')
    }
    closeModal()
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal?.classList.contains('hidden')) closeModal()
  })
}

initSettings()

// ─────────────────────────────────────────────────────────────────────────────

function fmtSec(s) {
  s = Math.floor(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}
