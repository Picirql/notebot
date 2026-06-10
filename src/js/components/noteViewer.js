import { showToast } from './toast.js'

let _rawMarkdown = ''

export function render() {
  return `
    <div class="note-output hidden" id="note-output">
      <nav class="note-breadcrumb" id="note-breadcrumb" aria-label="Breadcrumb">
        <span class="breadcrumb-root">Class Resources</span>
        <span class="breadcrumb-sep">›</span>
        <span class="breadcrumb-current" id="breadcrumb-current">Untitled</span>
      </nav>
      <div class="note-output-header">
        <span class="note-output-title">Generated Notes</span>
      </div>
      <div class="card">
        <div class="note-content" id="note-content"></div>
      </div>
      <div class="action-bar">
        <button class="btn btn-primary" id="btn-save">💾 Save</button>
        <button class="btn-toolbar" id="btn-copy">📋 Copy</button>
        <button class="btn-toolbar" id="btn-export-md">⬇ Export MD</button>
        <button class="btn-toolbar" id="btn-export-txt">⬇ Export TXT</button>
      </div>
    </div>
  `
}

export function setBreadcrumb(label) {
  const el = document.getElementById('breadcrumb-current')
  if (el) el.textContent = label || 'Untitled'
}

export function show() {
  document.getElementById('note-output')?.classList.remove('hidden')
}

export function hide() {
  document.getElementById('note-output')?.classList.add('hidden')
}

export function clear() {
  const el = document.getElementById('note-content')
  if (el) el.innerHTML = ''
  _rawMarkdown = ''
}

export function setContent(html) {
  const el = document.getElementById('note-content')
  if (!el) return
  const cursor = el.querySelector('.streaming-cursor')
  el.innerHTML = html
  if (cursor) el.appendChild(cursor)
}

export function appendContent(htmlChunk) {
  const el = document.getElementById('note-content')
  if (!el) return
  const cursor = el.querySelector('.streaming-cursor')
  if (cursor) cursor.remove()
  el.insertAdjacentHTML('beforeend', htmlChunk)
  const newCursor = document.createElement('span')
  newCursor.className = 'streaming-cursor'
  el.appendChild(newCursor)
}

export function finishStreaming() {
  document.getElementById('note-content')?.querySelector('.streaming-cursor')?.remove()
}

export function getContent() {
  return document.getElementById('note-content')?.innerHTML ?? ''
}

export function setRawContent(md) {
  _rawMarkdown = md
}

export function getRawContent() {
  return _rawMarkdown
}

export function init() {
  document.getElementById('btn-copy')?.addEventListener('click', async () => {
    const md = getRawContent()
    if (!md) { showToast('Nothing to copy', 'error'); return }
    try {
      await navigator.clipboard.writeText(md)
      showToast('Copied to clipboard!', 'success')
    } catch {
      showToast('Clipboard access denied', 'error')
    }
  })

  document.getElementById('btn-export-md')?.addEventListener('click', () => {
    const md = getRawContent()
    if (!md) { showToast('Nothing to export', 'error'); return }
    triggerDownload(md, 'notes.md', 'text/markdown')
    showToast('Exported as notes.md', 'success')
  })

  document.getElementById('btn-export-txt')?.addEventListener('click', () => {
    const md = getRawContent()
    if (!md) { showToast('Nothing to export', 'error'); return }
    triggerDownload(md, 'notes.txt', 'text/plain')
    showToast('Exported as notes.txt', 'success')
  })
}

function triggerDownload(content, filename, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
