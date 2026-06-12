import { showToast } from './toast.js'

let _onFileLoaded = null
let _onCapturedInput = null
let _pendingFiles = []

// ── Inline icon assets ───────────────────────────────────────────────────────

const FILE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5"/><path d="M9 13h6M9 17h6"/></svg>`
const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17H7a5 5 0 0 1 0-10h2"/><path d="M15 7h2a5 5 0 0 1 0 10h-2"/><path d="M8 12h8"/></svg>`
const TEXT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14M5 10h14M5 15h9M5 20h6"/></svg>`
const MIC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M9 21h6"/></svg>`
const VIDEO_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>`
const DOC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5"/><path d="M8 13l2 2 2-4 2 4 2-2"/></svg>`
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><path d="M10 11v6M14 11v6"/></svg>`

const PRESET_TABS = [
  { id: 'smart-notes', label: 'Smart Notes' },
]

const OPTION_TILES = [
  { id: 'file',      label: 'File',      icon: FILE_ICON },
  { id: 'link',      label: 'Link',      icon: LINK_ICON },
  { id: 'text',      label: 'Text',      icon: TEXT_ICON },
  { id: 'recording', label: 'Recording', icon: MIC_ICON },
  { id: 'video',     label: 'Video',     icon: VIDEO_ICON },
  { id: 'document',  label: 'Document',  icon: DOC_ICON },
]

export function render() {
  return `
    <div class="card upload-card">
      <div class="tab-nav" id="upload-preset-tabs">
        ${PRESET_TABS.map((t, i) => `
          <button class="tab-item${i === 0 ? ' active' : ''}" data-preset="${t.id}">${t.label}</button>
        `).join('')}
      </div>

      <div class="upload-options-grid" id="upload-options-grid">
        ${OPTION_TILES.map(o => `
          <button class="upload-option-tile${o.id === 'file' ? ' active' : ''}" data-option="${o.id}">
            <span class="upload-option-icon">${o.icon}</span>
            <span class="upload-option-label">${o.label}</span>
          </button>
        `).join('')}
      </div>

      <div class="upload-option-view" id="upload-option-view">
        <div class="upload-option-panel" data-panel="file" id="panel-file">
          <div class="upload-zone" id="upload-zone">
            <div class="upload-icon">📄</div>
            <div id="upload-drop-text">
              <div class="upload-title">Drag &amp; drop your file here</div>
              <div class="upload-subtitle">.txt, .json, or .md</div>
            </div>
            <button class="btn btn-primary btn-choose-file" id="btn-choose-file">+ Choose file</button>
            <input type="file" id="file-input" accept=".txt,.json,.md" style="display:none" />
            <div class="upload-info hidden" id="upload-info"></div>
            <button class="btn btn-danger hidden" id="btn-remove" style="margin-top:12px">✕ Remove</button>
          </div>
        </div>

        <div class="upload-option-panel hidden" data-panel="link" id="panel-link">
          <label class="prompt-label" for="link-input">Paste a URL or YouTube link</label>
          <div class="upload-link-row">
            <input type="text" id="link-input" class="upload-link-input" placeholder="https://www.youtube.com/watch?v=..." autocomplete="off" />
            <button class="btn btn-primary" id="btn-link-load">Load</button>
          </div>
        </div>

        <div class="upload-option-panel hidden" data-panel="text" id="panel-text">
          <label class="prompt-label" for="text-input">Write or paste your content</label>
          <textarea id="text-input" class="upload-text-area" placeholder="Paste markdown or plain text here..."></textarea>
          <button class="btn btn-primary" id="btn-text-load" style="margin-top:12px">Use this text</button>
        </div>

        <div class="upload-option-panel hidden" data-panel="recording" id="panel-recording">
          <div class="upload-zone" id="recording-zone">
            <div class="upload-icon">🎙</div>
            <div class="upload-title">Select an audio recording</div>
            <div class="upload-subtitle">.mp3, .wav, .m4a (max 4MB)</div>
            <button class="btn btn-primary" id="btn-choose-recording">+ Choose audio file</button>
            <input type="file" id="recording-input" accept="audio/*" style="display:none" />
          </div>
        </div>

        <div class="upload-option-panel hidden" data-panel="video" id="panel-video">
          <div class="upload-zone" id="video-zone">
            <div class="upload-icon">🎬</div>
            <div class="upload-title">Select a video file</div>
            <div class="upload-subtitle">.mp4, .mov, .webm (max 4MB)</div>
            <button class="btn btn-primary" id="btn-choose-video">+ Choose video file</button>
            <input type="file" id="video-input" accept="video/*" style="display:none" />
          </div>
        </div>

        <div class="upload-option-panel hidden" data-panel="document" id="panel-document">
          <div class="upload-zone" id="document-zone">
            <div class="upload-icon">📑</div>
            <div class="upload-title">Select a PDF or PowerPoint file</div>
            <div class="upload-subtitle">.pdf, .pptx (max 4MB)</div>
            <button class="btn btn-primary" id="btn-choose-document">+ Choose document</button>
            <input type="file" id="document-input" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" style="display:none" />
          </div>
        </div>
      </div>
    </div>

    <div class="modal-overlay hidden" id="upload-modal-overlay">
      <div class="upload-modal-card">
        <div class="upload-modal-header">
          <span class="upload-modal-title">Upload Files</span>
          <button class="settings-close" id="upload-modal-close" aria-label="Close">×</button>
        </div>
        <div class="upload-modal-body" id="upload-modal-file-list"></div>
        <button class="upload-modal-add-more" id="btn-add-more-files">+ Add more files</button>
        <div class="upload-modal-footer">
          <button class="btn-upload-confirm" id="btn-upload-confirm">Upload 1 File</button>
        </div>
      </div>
    </div>
  `
}

export function updateUploadInfo(filename, metadata) {
  const zone = document.getElementById('upload-zone')
  const dropText = document.getElementById('upload-drop-text')
  const info = document.getElementById('upload-info')
  const removeBtn = document.getElementById('btn-remove')
  if (!zone || !info) return

  zone.classList.add('uploaded')
  if (dropText) dropText.classList.add('hidden')

  info.innerHTML = `
    <div class="upload-filename">📄 ${escHtml(filename)}</div>
    <div class="upload-stats">
      ${metadata.isPlainText
        ? '<span>Plain text document</span>'
        : `<span>📊 ${metadata.segmentCount} segments</span>
           <span>⏱ ${metadata.duration}</span>
           <span>📌 ${escHtml(metadata.topic)}</span>`
      }
    </div>
  `
  info.classList.remove('hidden')
  removeBtn.classList.remove('hidden')
}

export function init(onFileLoaded, onCapturedInput) {
  _onFileLoaded = onFileLoaded
  _onCapturedInput = onCapturedInput

  initPresetTabs()
  initOptionTiles()
  initFilePanel()
  initLinkPanel()
  initTextPanel()
  initRecordingPanel()
  initVideoPanel()
  initDocumentPanel()
  initUploadModal()
}

// ── Preset tabs ──────────────────────────────────────────────────────────────

function initPresetTabs() {
  const tabs = document.querySelectorAll('#upload-preset-tabs .tab-item')
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab))
    })
  })
}

// ── Option tiles & dynamic view switching ───────────────────────────────────

function initOptionTiles() {
  document.querySelectorAll('.upload-option-tile').forEach(tile => {
    tile.addEventListener('click', () => switchOption(tile.dataset.option))
  })
}

function switchOption(option) {
  document.querySelectorAll('.upload-option-tile').forEach(tile =>
    tile.classList.toggle('active', tile.dataset.option === option))
  document.querySelectorAll('.upload-option-panel').forEach(panel =>
    panel.classList.toggle('hidden', panel.dataset.panel !== option))
}

// ── File panel (drag & drop + choose) ────────────────────────────────────────

function initFilePanel() {
  const zone = document.getElementById('upload-zone')
  const fileInput = document.getElementById('file-input')
  const chooseBtn = document.getElementById('btn-choose-file')
  const removeBtn = document.getElementById('btn-remove')

  zone.addEventListener('click', (e) => {
    if (removeBtn.contains(e.target) || chooseBtn.contains(e.target)) return
    fileInput.click()
  })

  chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    fileInput.click()
  })

  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.classList.add('drag-over')
  })

  zone.addEventListener('dragleave', (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over')
  })

  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    const file = e.dataTransfer.files[0]
    if (file) addPendingFiles([file])
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]
    if (file) addPendingFiles([file])
    fileInput.value = ''
  })

  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    resetZone()
    _onFileLoaded(null, null)
  })
}

function resetZone() {
  const zone = document.getElementById('upload-zone')
  const dropText = document.getElementById('upload-drop-text')
  const info = document.getElementById('upload-info')
  const removeBtn = document.getElementById('btn-remove')
  zone?.classList.remove('uploaded', 'drag-over')
  dropText?.classList.remove('hidden')
  if (info) { info.classList.add('hidden'); info.innerHTML = '' }
  removeBtn?.classList.add('hidden')
}

// ── Link panel ───────────────────────────────────────────────────────────────

function initLinkPanel() {
  document.getElementById('btn-link-load')?.addEventListener('click', () => {
    const input = document.getElementById('link-input')
    const url = input?.value.trim()
    if (!url) {
      showToast('Paste a URL or YouTube link first', 'error')
      return
    }
    _onCapturedInput?.('link', url)
    showToast('Link captured — generating from the reference', 'success')
  })
}

// ── Text panel ───────────────────────────────────────────────────────────────

function initTextPanel() {
  document.getElementById('btn-text-load')?.addEventListener('click', () => {
    const textarea = document.getElementById('text-input')
    const content = textarea?.value.trim()
    if (!content) {
      showToast('Write or paste some text first', 'error')
      return
    }
    _onCapturedInput?.('text', content)
    showToast('Text content captured', 'success')
  })
}

// ── Recording panel ──────────────────────────────────────────────────────────

function initRecordingPanel() {
  const zone = document.getElementById('recording-zone')
  const chooseBtn = document.getElementById('btn-choose-recording')
  const input = document.getElementById('recording-input')

  const openPicker = (e) => {
    if (chooseBtn.contains(e.target)) return
    input.click()
  }

  zone.addEventListener('click', openPicker)
  chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    input.click()
  })

  input.addEventListener('change', () => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      showToast('Audio file is too large (max 4MB)', 'error')
      return
    }
    _onCapturedInput?.('recording', file)
    showToast(`"${file.name}" captured — transcribing on generate`, 'success')
  })
}

// ── Video panel ──────────────────────────────────────────────────────────────

function initVideoPanel() {
  const zone = document.getElementById('video-zone')
  const chooseBtn = document.getElementById('btn-choose-video')
  const input = document.getElementById('video-input')

  const openPicker = (e) => {
    if (chooseBtn.contains(e.target)) return
    input.click()
  }

  zone.addEventListener('click', openPicker)
  chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    input.click()
  })

  input.addEventListener('change', () => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      showToast('Video file is too large (max 4MB)', 'error')
      return
    }
    _onCapturedInput?.('video', file)
    showToast(`"${file.name}" captured — analyzing on generate`, 'success')
  })
}

// ── Document panel (PDF / PowerPoint) ────────────────────────────────────────

function initDocumentPanel() {
  const zone = document.getElementById('document-zone')
  const chooseBtn = document.getElementById('btn-choose-document')
  const input = document.getElementById('document-input')

  const openPicker = (e) => {
    if (chooseBtn.contains(e.target)) return
    input.click()
  }

  zone.addEventListener('click', openPicker)
  chooseBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    input.click()
  })

  input.addEventListener('change', () => {
    const file = input.files[0]
    input.value = ''
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      showToast('Document is too large (max 4MB)', 'error')
      return
    }
    _onCapturedInput?.('document', file)
    showToast(`"${file.name}" captured — analyzing on generate`, 'success')
  })
}

// ── Upload Files modal ───────────────────────────────────────────────────────

function addPendingFiles(files) {
  const overlay = document.getElementById('upload-modal-overlay')
  if (overlay && !overlay.classList.contains('hidden')) {
    _pendingFiles.push(...files)
  } else {
    _pendingFiles = [...files]
  }
  renderModalFileList()
  overlay?.classList.remove('hidden')
}

function closeUploadModal() {
  document.getElementById('upload-modal-overlay')?.classList.add('hidden')
}

function renderModalFileList() {
  const list = document.getElementById('upload-modal-file-list')
  const confirmBtn = document.getElementById('btn-upload-confirm')
  if (!list) return

  list.innerHTML = _pendingFiles.map((file, i) => `
    <div class="upload-modal-file-row">
      <span class="upload-modal-file-icon">${FILE_ICON}</span>
      <div class="upload-modal-file-meta">
        <span class="upload-modal-file-name">${escHtml(file.name)}</span>
        <span class="upload-modal-file-size">${fmtSize(file.size)}</span>
      </div>
      <button class="upload-modal-file-remove" data-index="${i}" title="Remove file" aria-label="Remove file">${TRASH_ICON}</button>
    </div>
  `).join('')

  list.querySelectorAll('.upload-modal-file-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _pendingFiles.splice(Number(btn.dataset.index), 1)
      if (!_pendingFiles.length) {
        closeUploadModal()
        return
      }
      renderModalFileList()
    })
  })

  if (confirmBtn) {
    const n = _pendingFiles.length
    confirmBtn.textContent = `Upload ${n} File${n === 1 ? '' : 's'}`
    confirmBtn.disabled = n === 0
  }
}

function initUploadModal() {
  const overlay = document.getElementById('upload-modal-overlay')
  const closeBtn = document.getElementById('upload-modal-close')
  const addMoreBtn = document.getElementById('btn-add-more-files')
  const confirmBtn = document.getElementById('btn-upload-confirm')
  const fileInput = document.getElementById('file-input')

  closeBtn?.addEventListener('click', closeUploadModal)
  overlay?.addEventListener('click', (e) => { if (e.target === overlay) closeUploadModal() })
  addMoreBtn?.addEventListener('click', () => fileInput?.click())

  confirmBtn?.addEventListener('click', () => {
    const file = _pendingFiles[0]
    if (!file) return
    closeUploadModal()
    readFile(file)
  })
}

function readFile(file) {
  const reader = new FileReader()
  reader.onload = (e) => _onFileLoaded(file, e.target.result)
  reader.readAsText(file)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
