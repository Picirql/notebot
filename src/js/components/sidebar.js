import { showToast } from './toast.js'
import { fetchNotebooks } from '../services/api.js'
import {
  showCreateNotebookModal,
  showRenameDialog,
  showDescriptionModal,
  showDeleteConfirm,
} from './notebookModals.js'

let _allNotebooks = []
let _onNotebookSelect = null
let _onHome = null
let _searchTimer = null
let _activeDropdown = null
let _activeNotebookId = null

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

// ── Render ────────────────────────────────────────────────────────────────────

export function render() {
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <button class="sidebar-logo" id="sidebar-logo" title="Back to home">
          ${MASCOT_SVG}
          <span class="sidebar-title">VED NOTES</span>
        </button>
        <button id="btn-settings" class="btn-settings" title="Settings" aria-label="Open settings">⚙</button>
      </div>

      <div class="sidebar-notebooks-header" id="sidebar-notebooks-header">
        <span class="sidebar-notebooks-label">My Notebooks</span>
        <button class="btn-add-notebook" id="btn-add-notebook" title="New notebook" aria-label="Create new notebook">+</button>
      </div>

      <div class="sidebar-notebooks-wrapper collapsed" id="sidebar-notebooks-wrapper">
        <div class="sidebar-notebooks-search">
          <input type="text" id="notebook-search-input" placeholder="Search notebooks..." autocomplete="off" />
        </div>
        <div class="sidebar-notebooks-list" id="sidebar-notebooks-list"></div>
      </div>
    </aside>
  `
}

// ── Public API ────────────────────────────────────────────────────────────────

export function init(onNotebookSelect, _unusedNoteDelete, onHome) {
  _onNotebookSelect = onNotebookSelect
  _onHome = onHome

  document.getElementById('sidebar-logo')?.addEventListener('click', () => {
    _activeNotebookId = null
    _onHome?.()
  })

  // Clicking the header (but not the + button) toggles the list
  document.getElementById('sidebar-notebooks-header')?.addEventListener('click', () => {
    const wrapper = document.getElementById('sidebar-notebooks-wrapper')
    const header  = document.getElementById('sidebar-notebooks-header')
    wrapper?.classList.toggle('collapsed')
    header?.classList.toggle('expanded', !wrapper?.classList.contains('collapsed'))
  })

  // + button opens Create Notebook modal — stop propagation so header toggle doesn't fire
  document.getElementById('btn-add-notebook')?.addEventListener('click', (e) => {
    e.stopPropagation()
    showCreateNotebookModal((notebook) => {
      _allNotebooks.unshift(notebook)
      renderNotebookList(_allNotebooks)
      // Auto-expand the list after creation
      document.getElementById('sidebar-notebooks-wrapper')?.classList.remove('collapsed')
      document.getElementById('sidebar-notebooks-header')?.classList.add('expanded')
    })
  })

  // Notebook search with debounce
  const searchInput = document.getElementById('notebook-search-input')
  searchInput?.addEventListener('input', () => {
    clearTimeout(_searchTimer)
    _searchTimer = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase()
      renderNotebookList(
        q
          ? _allNotebooks.filter(nb =>
              nb.name.toLowerCase().includes(q) ||
              (nb.description ?? '').toLowerCase().includes(q)
            )
          : _allNotebooks
      )
    }, 200)
  })

  // Close open dropdown when clicking anywhere outside
  document.addEventListener('click', () => closeActiveDropdown())

  // Initial render
  loadNotebooks()
}

export function loadNotebooks(notebooks) {
  _allNotebooks = notebooks ?? fetchNotebooks()
  renderNotebookList(_allNotebooks)
}

export function setActiveNotebook(id) {
  _activeNotebookId = id
  document.querySelectorAll('.notebook-item').forEach(item => {
    item.classList.toggle('active', Number(item.dataset.id) === Number(id))
  })
}

export function refreshNotebooks() {
  _allNotebooks = fetchNotebooks()
  renderNotebookList(_allNotebooks)
}

// Legacy stubs — main.js still calls these; will be removed when main.js is migrated
export function loadNotes() {}
export function setActive() {}
export function prependNote() {}

// ── Internal rendering ───────────────────────────────────────────────────────

function renderNotebookList(notebooks) {
  const list = document.getElementById('sidebar-notebooks-list')
  if (!list) return

  if (!notebooks.length) {
    list.innerHTML = `
      <div class="sidebar-empty">
        <div class="sidebar-empty-icon">📓</div>
        <div>No notebooks yet</div>
      </div>
    `
    return
  }

  list.innerHTML = notebooks.map(nb => `
    <div class="notebook-item${_activeNotebookId === nb.id ? ' active' : ''}" data-id="${nb.id}">
      <div class="notebook-item-info">
        <div class="notebook-item-name">
          ${escHtml(nb.name)}
          ${nb.notes.length > 0 ? `<span class="notebook-count-badge">${nb.notes.length}</span>` : ''}
        </div>
        <div class="notebook-item-date">${fmtDate(nb.created_at)}</div>
      </div>
      <div class="notebook-item-actions">
        <button
          class="notebook-menu-btn"
          id="notebook-menu-${nb.id}"
          data-id="${nb.id}"
          title="More options"
          aria-label="Notebook options"
        >⋯</button>
        <div class="notebook-dropdown hidden" id="notebook-dropdown-${nb.id}">
          <button class="notebook-dropdown-item" data-action="rename"      data-id="${nb.id}">Rename Notebook</button>
          <button class="notebook-dropdown-item" data-action="delete"      data-id="${nb.id}">Delete Notebook</button>
          <button class="notebook-dropdown-item" data-action="description" data-id="${nb.id}">View/Change Description</button>
        </div>
      </div>
    </div>
  `).join('')

  // Notebook row click → select
  list.querySelectorAll('.notebook-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.notebook-item-actions')) return
      const id = Number(item.dataset.id)
      setActiveNotebook(id)
      _onNotebookSelect?.(id)
    })
  })

  // 3-dots button → toggle dropdown
  list.querySelectorAll('.notebook-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const id = Number(btn.dataset.id)
      const dropdown = document.getElementById(`notebook-dropdown-${id}`)
      if (!dropdown) return
      const isOpen = !dropdown.classList.contains('hidden')
      closeActiveDropdown()
      if (!isOpen) {
        const rect = btn.getBoundingClientRect()
        dropdown.style.top = `${rect.bottom + 4}px`
        dropdown.style.right = `${window.innerWidth - rect.right}px`
        dropdown.classList.remove('hidden')
        _activeDropdown = dropdown
      }
    })
  })

  // Dropdown action items
  list.querySelectorAll('.notebook-dropdown-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const action = btn.dataset.action
      const id = Number(btn.dataset.id)
      const notebook = _allNotebooks.find(nb => nb.id === id)
      closeActiveDropdown()
      if (!notebook) return

      if (action === 'rename') {
        showRenameDialog(notebook, (updated) => {
          Object.assign(notebook, updated)
          renderNotebookList(_allNotebooks)
        })
      } else if (action === 'delete') {
        showDeleteConfirm(notebook, (deletedId) => {
          _allNotebooks = _allNotebooks.filter(nb => nb.id !== deletedId)
          renderNotebookList(_allNotebooks)
          if (_activeNotebookId === deletedId) {
            _activeNotebookId = null
            _onHome?.()
          }
        })
      } else if (action === 'description') {
        showDescriptionModal(notebook, (updated) => {
          Object.assign(notebook, updated)
        })
      }
    })
  })
}

function closeActiveDropdown() {
  if (_activeDropdown) {
    _activeDropdown.classList.add('hidden')
    _activeDropdown = null
  }
}

function fmtDate(str) {
  return new Date(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
