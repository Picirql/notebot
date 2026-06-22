import * as fileUpload from './components/fileUpload.js'
import * as promptInput from './components/promptInput.js'
import * as noteViewer from './components/noteViewer.js'
import * as sidebar from './components/sidebar.js'
import { showToast } from './components/toast.js'
import * as api from './services/api.js'
import { renderMarkdown } from './services/markdown.js'
import {
  showRenameNoteModal,
  showDeleteNoteConfirm,
  showMoveNoteModal,
  showCopyNoteModal,
} from './components/noteModals.js'

// ── App state ────────────────────────────────────────────────────────────────
let currentFile = null
let currentFileContent = null
let currentLinkUrl = null
let currentMetadata = null
let currentNoteId = null
let currentNotebookId = null
let currentTab = 'generate'
let _activeExportDropdown = null
let _activeNoteDropdown = null
const _notebookTabs = {} // notebookId → last active tab

// ── Render layout ────────────────────────────────────────────────────────────
document.getElementById('app').innerHTML = `
  <div class="app-layout">
    ${sidebar.render()}
    <main class="main-content" id="main-content">
      <div class="main-inner">

        <!-- 4.1 Blank state -->
        <div id="view-blank" class="view-blank-container">
          <div class="blank-state">
            <div class="blank-state-icon">📓</div>
            <h2 class="blank-state-title">Your study space awaits</h2>
            <p class="blank-state-desc">
              Select a notebook from the sidebar or click
              <strong>+</strong> to create one and start generating study notes.
            </p>
          </div>
        </div>

        <!-- Notebook workspace -->
        <div id="view-notebook" class="view-notebook-container hidden">

          <!-- Active notebook context bar -->
          <div class="workspace-notebook-header" id="workspace-notebook-header">
            <span class="workspace-notebook-name" id="workspace-notebook-name"></span>
            <span class="workspace-notebook-count" id="workspace-notebook-count"></span>
          </div>

          <!-- 4.2 Tab header -->
          <div class="workspace-tabs-header" id="workspace-tabs-header">
            <button class="workspace-tab-btn active" data-tab="generate">Generate Notes</button>
            <button class="workspace-tab-btn" data-tab="store">Store Notes</button>
            <button class="workspace-tab-btn" data-tab="chat">Chat</button>
          </div>

          <!-- 4.3 Generate Notes tab -->
          <div class="workspace-tab-panel" id="tab-generate">
            ${fileUpload.render()}
            ${promptInput.render()}
            ${noteViewer.render()}
          </div>

          <!-- 4.4 Store Notes tab -->
          <div class="workspace-tab-panel hidden" id="tab-store">
            <div id="store-notes-list"></div>
            <div id="store-note-reader" class="hidden">
              <button id="btn-store-back" class="btn" style="margin-bottom:16px;">← Back to notes</button>
              <div class="card" style="margin-top:0">
                <div class="note-content" id="store-note-content"></div>
              </div>
            </div>
          </div>

          <!-- 4.5 Chat tab -->
          <div class="workspace-tab-panel hidden" id="tab-chat">
            <div class="chat-container">
              <div class="chat-messages" id="chat-messages"></div>
              <div class="chat-input-row">
                <input type="text" id="chat-user-input" placeholder="Ask a question about your notes..." autocomplete="off" />
                <button class="btn btn-primary" id="btn-chat-send">Send</button>
              </div>
            </div>
          </div>

        </div>

      </div>
    </main>
  </div>
  <div class="toast-container"></div>
`

// ── Init components ──────────────────────────────────────────────────────────
sidebar.init(onNotebookSelect, onNoteDelete, onHome)
fileUpload.init(onFileLoaded, onCapturedInput)
promptInput.init(onGenerate)
noteViewer.init()
initTabs()
initStoreBack()
initSettings()

// Close any open dropdowns on document click
document.addEventListener('click', () => {
  if (_activeExportDropdown) {
    _activeExportDropdown.classList.add('hidden')
    _activeExportDropdown = null
  }
  if (_activeNoteDropdown) {
    _activeNoteDropdown.classList.add('hidden')
    _activeNoteDropdown = null
  }
})

// ── Restore last opened notebook ─────────────────────────────────────────────
const _lastId = Number(localStorage.getItem('notebot_last_notebook'))
const _lastNotebook = _lastId ? api.fetchNotebooks().find(nb => nb.id === _lastId) : null
if (_lastNotebook) {
  onNotebookSelect(_lastNotebook.id)
  document.getElementById('sidebar-notebooks-wrapper')?.classList.remove('collapsed')
  document.getElementById('sidebar-notebooks-header')?.classList.add('expanded')
} else {
  setView('blank')
}

// ── View helpers ─────────────────────────────────────────────────────────────

function setView(view) {
  document.getElementById('view-blank')?.classList.toggle('hidden', view !== 'blank')
  document.getElementById('view-notebook')?.classList.toggle('hidden', view !== 'notebook')
}

// ── Tab switching ─────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.workspace-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  })
}

function switchTab(tab) {
  currentTab = tab
  if (currentNotebookId) _notebookTabs[currentNotebookId] = tab
  document.querySelectorAll('.workspace-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  document.querySelectorAll('.workspace-tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tab}`)
  })
  if (tab === 'store') renderStoreNotes()
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function onNotebookSelect(notebookId) {
  currentNotebookId = notebookId
  const notebook = api.fetchNotebooks().find(nb => nb.id === notebookId)
  if (!notebook) return

  localStorage.setItem('notebot_last_notebook', String(notebookId))
  sidebar.setActiveNotebook(notebookId)
  setView('notebook')
  switchTab(_notebookTabs[notebookId] ?? 'generate')
  updateWorkspaceHeader()

  noteViewer.hide()
  noteViewer.clear()
  noteViewer.setSaveStatus('')
  currentNoteId = null

  initChatPanel(notebook.name)
}

function onHome() {
  currentNotebookId = null
  currentNoteId = null
  localStorage.removeItem('notebot_last_notebook')
  noteViewer.hide()
  noteViewer.clear()
  noteViewer.setSaveStatus('')
  setView('blank')
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
}

function onCapturedInput(kind, data) {
  if (kind === 'link') {
    currentFile = null
    currentFileContent = null
    currentLinkUrl = data
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Web Link', isPlainText: true }
    fileUpload.updateUploadInfo(data, currentMetadata)
    promptInput.setEnabled(true)
    return
  }
  if (kind === 'recording') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Audio Recording', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
    return
  }
  if (kind === 'video') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Video', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
    return
  }
  if (kind === 'document') {
    currentLinkUrl = null
    currentFile = data
    currentFileContent = null
    currentMetadata = { segmentCount: 0, duration: 'N/A', topic: 'Document', isPlainText: true }
    fileUpload.updateUploadInfo(data.name, currentMetadata)
    promptInput.setEnabled(true)
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
  if (!currentNotebookId) {
    showToast('Please select or create a notebook first', 'error')
    return
  }

  const sourceLabel = currentFile ? currentFile.name : currentLinkUrl

  promptInput.setLoading(true)
  noteViewer.clear()
  noteViewer.show()
  noteViewer.setBreadcrumb(sourceLabel)
  noteViewer.setSaveStatus('')
  currentNoteId = null

  let rawAccumulated = ''
  let cursorInjected = false
  let lastRender = 0
  const RENDER_INTERVAL = 150

  try {
    const stream = await api.generateNotes(currentFile, prompt, preset, currentLinkUrl, currentNotebookId)

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
        noteViewer.setContent(renderMarkdown(rawAccumulated))

        const savedNote = api.saveNoteToNotebook(currentNotebookId, {
          id: chunk.noteId,
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
        noteViewer.setSaveStatus('✓ Saved to notebook')
        showToast(`Notes saved to notebook: "${savedNote.title}"`, 'success')
        sidebar.refreshNotebooks()
        updateWorkspaceHeader()
        if (currentTab === 'store') renderStoreNotes()
      }
    })
  } catch (err) {
    noteViewer.finishStreaming()
    showToast(`Generation failed: ${err.message}`, 'error')
  } finally {
    promptInput.setLoading(false)
  }
}

// ── Store Notes ──────────────────────────────────────────────────────────────

function renderStoreNotes() {
  const listEl = document.getElementById('store-notes-list')
  const readerEl = document.getElementById('store-note-reader')
  if (!listEl || !readerEl) return

  readerEl.classList.add('hidden')
  listEl.classList.remove('hidden')

  const notebook = api.fetchNotebooks().find(nb => nb.id === currentNotebookId)
  const notes = notebook?.notes ?? []

  if (!notes.length) {
    listEl.innerHTML = `
      <div class="sidebar-empty" style="padding:60px 24px;">
        <div class="sidebar-empty-icon">📋</div>
        <div>No notes saved in this notebook yet.<br>Generate some notes first!</div>
      </div>
    `
    return
  }

  listEl.innerHTML = `
    <div class="store-notes-grid">
      ${notes.map(note => `
        <div class="store-note-card" data-id="${note.id}">
          <!-- 3-dots menu -->
          <button class="store-note-menu-btn" data-id="${note.id}" title="More options" aria-label="Note options">⋯</button>
          <div class="store-note-dropdown hidden" id="note-dd-${note.id}">
            <button class="store-note-dd-item" data-action="rename" data-id="${note.id}">✏ Rename Note</button>
            <button class="store-note-dd-item" data-action="move"   data-id="${note.id}">↗ Move to Notebook</button>
            <button class="store-note-dd-item" data-action="copy"   data-id="${note.id}">⎘ Copy to Notebook(s)</button>
          </div>

          <div class="store-note-card-header">
            <div class="store-note-title">${escHtml(note.title)}</div>
            <div class="store-note-meta">
              ${note.preset ? `<span class="preset-badge">${note.preset.replace(/_/g, ' ')}</span>` : ''}
              <span>${fmtDate(note.created_at)}</span>
            </div>
          </div>
          <div class="store-note-preview">${escHtml(note.preview ?? '')}</div>
          <div class="store-note-actions" onclick="event.stopPropagation()">
            <button class="btn btn-sm store-note-view" data-id="${note.id}">View</button>
            <div class="store-note-export-wrap">
              <button class="btn btn-sm store-note-export-btn" data-id="${note.id}">Export ▾</button>
              <div class="store-export-dropdown hidden" id="export-dd-${note.id}">
                <button class="store-export-item" data-format="md"   data-id="${note.id}">Markdown (.md)</button>
                <button class="store-export-item" data-format="txt"  data-id="${note.id}">Plain Text (.txt)</button>
                <button class="store-export-item" data-format="pdf"  data-id="${note.id}">PDF (.pdf)</button>
                <button class="store-export-item" data-format="docx" data-id="${note.id}">Word (.docx)</button>
              </div>
            </div>
            <button class="btn btn-sm store-note-delete" data-id="${note.id}">Delete</button>
          </div>
        </div>
      `).join('')}
    </div>
  `

  // Card click → view note
  listEl.querySelectorAll('.store-note-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id)
      const note = notes.find(n => n.id === id)
      if (note) viewStoredNote(note)
    })
  })

  // View button
  listEl.querySelectorAll('.store-note-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const note = notes.find(n => n.id === Number(btn.dataset.id))
      if (note) viewStoredNote(note)
    })
  })

  // Delete button → custom modal
  listEl.querySelectorAll('.store-note-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = Number(btn.dataset.id)
      const note = notes.find(n => n.id === id)
      if (!note) return
      showDeleteNoteConfirm(note, () => {
        try {
          api.deleteNoteFromNotebook(currentNotebookId, id)
          api.deleteNoteVectors(id)
          showToast('Note deleted', 'success')
          sidebar.refreshNotebooks()
          updateWorkspaceHeader()
          renderStoreNotes()
        } catch (err) {
          showToast(`Delete failed: ${err.message}`, 'error')
        }
      })
    })
  })

  // 3-dots menu button → toggle dropdown
  listEl.querySelectorAll('.store-note-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const dd = document.getElementById(`note-dd-${id}`)
      if (!dd) return
      const isOpen = !dd.classList.contains('hidden')
      closeActiveNoteDropdown()
      if (_activeExportDropdown) { _activeExportDropdown.classList.add('hidden'); _activeExportDropdown = null }
      if (!isOpen) {
        dd.classList.remove('hidden')
        btn.classList.add('open')
        _activeNoteDropdown = dd
        _activeNoteDropdown._btn = btn
      }
    })
  })

  // 3-dots dropdown action items
  listEl.querySelectorAll('.store-note-dd-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const action = btn.dataset.action
      const id = Number(btn.dataset.id)
      const note = notes.find(n => n.id === id)
      closeActiveNoteDropdown()
      if (!note) return

      if (action === 'rename') {
        showRenameNoteModal(note, currentNotebookId, (newTitle) => {
          note.title = newTitle
          renderStoreNotes()
        })
      } else if (action === 'move') {
        showMoveNoteModal(note, currentNotebookId, () => {
          sidebar.refreshNotebooks()
          updateWorkspaceHeader()
          renderStoreNotes()
        })
      } else if (action === 'copy') {
        showCopyNoteModal(note, currentNotebookId, () => {
          sidebar.refreshNotebooks()
        })
      }
    })
  })

  // Export dropdown toggle
  listEl.querySelectorAll('.store-note-export-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = btn.dataset.id
      const dd = document.getElementById(`export-dd-${id}`)
      if (!dd) return
      const isOpen = !dd.classList.contains('hidden')
      if (_activeExportDropdown) {
        _activeExportDropdown.classList.add('hidden')
        _activeExportDropdown = null
      }
      if (!isOpen) {
        dd.classList.remove('hidden')
        _activeExportDropdown = dd
      }
    })
  })

  // Export item actions
  listEl.querySelectorAll('.store-export-item').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const id = Number(btn.dataset.id)
      const format = btn.dataset.format
      const note = notes.find(n => n.id === id)
      if (_activeExportDropdown) {
        _activeExportDropdown.classList.add('hidden')
        _activeExportDropdown = null
      }
      if (note) await exportNote(note, format)
    })
  })
}

function viewStoredNote(note) {
  const listEl = document.getElementById('store-notes-list')
  const readerEl = document.getElementById('store-note-reader')
  const contentEl = document.getElementById('store-note-content')
  if (!listEl || !readerEl || !contentEl) return
  listEl.classList.add('hidden')
  readerEl.classList.remove('hidden')
  contentEl.innerHTML = renderMarkdown(note.content)
}

function initStoreBack() {
  document.getElementById('btn-store-back')?.addEventListener('click', renderStoreNotes)
}

async function exportNote(note, format) {
  const content = note.content ?? ''
  const slug = (note.title || 'notes').replace(/\s+/g, '-').toLowerCase()

  if (format === 'md') {
    triggerDownload(content, `${slug}.md`, 'text/markdown')
    showToast('Exported as .md', 'success')
    return
  }
  if (format === 'txt') {
    triggerDownload(content, `${slug}.txt`, 'text/plain')
    showToast('Exported as .txt', 'success')
    return
  }
  if (format === 'pdf') {
    try {
      showToast('Generating PDF…', 'success')
      const tempEl = document.createElement('div')
      tempEl.className = 'note-content'
      tempEl.style.cssText = 'position:fixed;top:-9999px;left:0;width:800px;background:#fff;color:#000;padding:32px;font-family:Inter,sans-serif;'
      tempEl.innerHTML = renderMarkdown(content)
      document.body.appendChild(tempEl)
      const { exportNotesToPdf } = await import('./services/pdfExport.js')
      await exportNotesToPdf(tempEl, `${slug}.pdf`)
      document.body.removeChild(tempEl)
      showToast('Exported as .pdf', 'success')
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`, 'error')
    }
    return
  }
  if (format === 'docx') {
    try {
      const { buildDocxBlob } = await import('./services/docxExport.js')
      const blob = await buildDocxBlob(content, note.title || 'Notes')
      const url = URL.createObjectURL(blob)
      const a = Object.assign(document.createElement('a'), { href: url, download: `${slug}.docx` })
      a.click()
      URL.revokeObjectURL(url)
      showToast('Exported as .docx', 'success')
    } catch (err) {
      showToast(`DOCX export failed: ${err.message}`, 'error')
    }
  }
}

function closeActiveNoteDropdown() {
  if (_activeNoteDropdown) {
    _activeNoteDropdown.classList.add('hidden')
    _activeNoteDropdown._btn?.classList.remove('open')
    _activeNoteDropdown = null
  }
}

function triggerDownload(content, filename, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

// ── Chat ─────────────────────────────────────────────────────────────────────

function initChatPanel(notebookName) {
  const messages = document.getElementById('chat-messages')
  const input = document.getElementById('chat-user-input')
  const sendBtn = document.getElementById('btn-chat-send')
  if (!messages) return

  messages.innerHTML = ''
  addChatBubble('ai', `Hi there! This is the Chat channel for <strong>${escHtml(notebookName ?? 'this notebook')}</strong>. Ask me questions or request summaries regarding the notes stored in this notebook.`)

  // Sync banner — shown when there are notes that may not be in Pinecone yet
  const notebook = api.fetchNotebooks().find(nb => nb.id === currentNotebookId)
  const noteCount = notebook?.notes?.length ?? 0
  if (noteCount > 0) {
    const banner = document.createElement('div')
    banner.className = 'chat-sync-banner'
    banner.innerHTML = `
      <span>Sync your ${noteCount} note${noteCount !== 1 ? 's' : ''} so the AI can answer questions about them.</span>
      <button class="btn btn-sm btn-primary" id="btn-chat-sync">Sync Notes</button>
    `
    messages.appendChild(banner)

    banner.querySelector('#btn-chat-sync')?.addEventListener('click', async () => {
      banner.innerHTML = `<span class="chat-sync-progress">Syncing ${noteCount} note${noteCount !== 1 ? 's' : ''}… this may take a moment</span>`
      try {
        const result = await api.syncNotebookNotes(currentNotebookId, notebook.notes)
        banner.innerHTML = `<span class="chat-sync-done">✓ Synced — ${result.totalChunks} chunks indexed. You can now ask questions!</span>`
        setTimeout(() => banner.remove(), 4000)
      } catch (err) {
        banner.innerHTML = `<span style="color:var(--color-danger)">Sync failed: ${escHtml(err.message)}</span>`
      }
    })
  }

  // Re-attach send handlers (remove old ones by cloning the button)
  const newSendBtn = sendBtn?.cloneNode(true)
  sendBtn?.parentNode?.replaceChild(newSendBtn, sendBtn)
  const newInput = input?.cloneNode(true)
  input?.parentNode?.replaceChild(newInput, input)

  let chatStreaming = false

  async function send() {
    const inputEl = document.getElementById('chat-user-input')
    const text = inputEl?.value.trim()
    if (!text || chatStreaming) return

    addChatBubble('user', escHtml(text))
    inputEl.value = ''

    chatStreaming = true
    const aiBubble = addChatBubble('ai', '<span class="chat-thinking">Thinking…</span>')
    let accumulated = ''

    try {
      const stream = await api.chatWithNotebook(currentNotebookId, text)
      await readSSE(stream, (chunk) => {
        if (chunk.error) {
          if (aiBubble) aiBubble.innerHTML = `<em>${escHtml(chunk.error)}</em>`
          return
        }
        if (chunk.text) {
          accumulated += chunk.text
          if (aiBubble) {
            aiBubble.innerHTML = renderMarkdown(accumulated)
            document.getElementById('chat-messages')?.scrollTo({ top: 99999 })
          }
        }
      })
    } catch (err) {
      if (aiBubble) aiBubble.innerHTML = `<em>Failed: ${escHtml(err.message)}</em>`
    } finally {
      chatStreaming = false
    }
  }

  newSendBtn?.addEventListener('click', send)
  newInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  })
}

function addChatBubble(role, html) {
  const messages = document.getElementById('chat-messages')
  if (!messages) return null
  const div = document.createElement('div')
  div.className = `chat-bubble chat-bubble-${role}`
  div.innerHTML = html
  messages.appendChild(div)
  messages.scrollTop = messages.scrollHeight
  return div
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
      buffer = lines.pop()

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6).trim()
        if (!payload) continue
        try { onChunk(JSON.parse(payload)) } catch { /* skip malformed JSON */ }
      }
    }

    const remaining = buffer.trim()
    if (remaining.startsWith('data: ')) {
      const payload = remaining.slice(6).trim()
      if (payload) { try { onChunk(JSON.parse(payload)) } catch { /* ignore */ } }
    }
  } finally {
    reader.releaseLock()
  }
}

// ── Workspace notebook header ─────────────────────────────────────────────────

function updateWorkspaceHeader() {
  const notebook = api.fetchNotebooks().find(nb => nb.id === currentNotebookId)
  if (!notebook) return
  const nameEl  = document.getElementById('workspace-notebook-name')
  const countEl = document.getElementById('workspace-notebook-count')
  if (nameEl)  nameEl.textContent  = notebook.name
  if (countEl) {
    const n = notebook.notes.length
    countEl.textContent = n === 0 ? 'No notes yet' : `${n} note${n !== 1 ? 's' : ''}`
  }
}

// ── Client-side metadata extraction ──────────────────────────────────────────

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
  const modal     = document.getElementById('settings-modal')
  const input     = document.getElementById('settings-api-key')
  const toggle    = document.getElementById('settings-toggle')
  const saveBtn   = document.getElementById('settings-save')
  const cancelBtn = document.getElementById('settings-cancel')
  const closeBtn  = document.getElementById('settings-close')
  const openBtn   = document.getElementById('btn-settings')
  const status    = document.getElementById('settings-status')

  function openModal() {
    const stored = localStorage.getItem('gemini_api_key') || ''
    input.value = stored
    input.type = 'password'
    toggle.textContent = 'Show'
    status.textContent = stored ? 'A key is currently saved.' : ''
    modal.classList.remove('hidden')
    input.focus()
  }

  function closeModal() { modal.classList.add('hidden') }

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtSec(s) {
  s = Math.floor(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
