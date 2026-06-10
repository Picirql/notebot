import { showToast } from './toast.js'
import { deleteNote } from '../services/api.js'

let _allNotes = []
let _onNoteSelect = null
let _onNoteDelete = null
let _onHome = null
let _debounceTimer = null

// ── Inline icon assets ───────────────────────────────────────────────────────

const MASCOT_SVG = `
  <svg class="mascot-icon" width="30" height="30" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 17C4 12 3 6 6 4c4-1 10 4 13 11" fill="currentColor"/>
    <path d="M39 17c5-5 6-11 3-13-4-1-10 4-13 11" fill="currentColor"/>
    <circle cx="24" cy="27" r="14" fill="currentColor"/>
    <ellipse cx="24" cy="35" rx="6" ry="4" fill="#fff"/>
    <circle cx="24" cy="34" r="1.4" fill="currentColor"/>
    <g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round">
      <circle cx="18" cy="26" r="4.5"/>
      <circle cx="30" cy="26" r="4.5"/>
      <path d="M22.5 26h3"/>
      <path d="M13.5 25 10 23"/>
      <path d="M34.5 25 38 23"/>
    </g>
  </svg>
`

const DOC_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v5h5"/></svg>`

export function render() {
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <button class="sidebar-logo" id="sidebar-logo" title="Back to upload">
          ${MASCOT_SVG}
          <span class="sidebar-title">STUDY FETCH</span>
        </button>
        <button id="btn-settings" class="btn-settings" title="Settings" aria-label="Open settings">⚙</button>
      </div>

      <div class="sidebar-search">
        <input type="text" id="sidebar-search-input" placeholder="Search notes..." autocomplete="off" />
      </div>

      <div class="sidebar-notes-header">Your Notes</div>
      <div class="sidebar-list" id="sidebar-list">
        <div class="sidebar-empty">
          <div class="sidebar-empty-icon">📋</div>
          <div>No saved notes yet</div>
        </div>
      </div>
    </aside>
  `
}

export function loadNotes(notes) {
  _allNotes = notes ?? []
  renderNoteList(_allNotes)
}

export function setActive(noteId) {
  document.querySelectorAll('.note-item').forEach(item => {
    item.classList.toggle('active', Number(item.dataset.id) === Number(noteId))
  })
}

export function prependNote(note) {
  _allNotes.unshift(note)
  renderNoteList(_allNotes)
}

export function init(onNoteSelect, onNoteDelete, onHome) {
  _onNoteSelect = onNoteSelect
  _onNoteDelete = onNoteDelete
  _onHome = onHome

  // Logo routes the main panel back to the upload page
  document.getElementById('sidebar-logo')?.addEventListener('click', () => {
    setActive(null)
    _onHome?.()
  })

  const search = document.getElementById('sidebar-search-input')
  search?.addEventListener('input', () => {
    clearTimeout(_debounceTimer)
    _debounceTimer = setTimeout(() => {
      const q = search.value.trim().toLowerCase()
      if (!q) {
        renderNoteList(_allNotes)
      } else {
        renderNoteList(_allNotes.filter(n =>
          n.title.toLowerCase().includes(q) || (n.preview ?? '').toLowerCase().includes(q)
        ))
      }
    }, 300)
  })
}

// ── Internal rendering ───────────────────────────────────────────────────────

function renderNoteList(notes) {
  const list = document.getElementById('sidebar-list')
  if (!list) return

  if (!notes.length) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">📋</div>
        <div>No saved notes yet</div>
      </div>
    `
    return
  }

  list.innerHTML = notes.map(note => `
    <div class="note-item" data-id="${note.id}" style="position:relative">
      <div class="note-item-title"><span class="note-item-icon">${DOC_ICON}</span>${escHtml(note.title)}</div>
      <div class="note-item-meta">
        <span>${fmtDate(note.created_at)}</span>
        ${note.preset ? `<span class="preset-badge">${note.preset.replace(/_/g, ' ')}</span>` : ''}
      </div>
      <div class="note-item-preview">${escHtml(note.preview ?? '')}</div>
      <button
        class="note-delete-btn"
        data-id="${note.id}"
        title="Delete note"
        style="
          position:absolute; top:10px; right:10px;
          background:none; border:none; cursor:pointer;
          color:var(--text-muted); font-size:1rem; line-height:1;
          opacity:0; transition:opacity var(--transition-fast);
          padding:2px 6px; border-radius:4px;
        "
      >×</button>
    </div>
  `).join('')

  // Show/hide delete button on hover
  list.querySelectorAll('.note-item').forEach(item => {
    const delBtn = item.querySelector('.note-delete-btn')
    item.addEventListener('mouseenter', () => { if (delBtn) delBtn.style.opacity = '1' })
    item.addEventListener('mouseleave', () => { if (delBtn) delBtn.style.opacity = '0' })

    item.addEventListener('click', (e) => {
      if (delBtn?.contains(e.target)) return
      const id = Number(item.dataset.id)
      setActive(id)
      _onNoteSelect?.(id)
    })
  })

  list.querySelectorAll('.note-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (!confirm('Delete this note?')) return
      const id = Number(btn.dataset.id)
      try {
        deleteNote(id)
        _allNotes = _allNotes.filter(n => n.id !== id)
        renderNoteList(_allNotes)
        showToast('Note deleted', 'success')
        _onNoteDelete?.(id)
      } catch (err) {
        showToast(`Failed to delete: ${err.message}`, 'error')
      }
    })
  })
}

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
