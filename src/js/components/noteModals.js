import { showToast } from './toast.js'
import { renameNoteInNotebook, moveNote, copyNote, fetchNotebooks } from '../services/api.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function injectModal(html) {
  const el = document.createElement('div')
  el.innerHTML = html.trim()
  const overlay = el.firstElementChild
  document.body.appendChild(overlay)
  return overlay
}

function closeModal(overlay) { overlay.remove() }

function onEscClose(overlay) {
  function handler(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler) }
  }
  document.addEventListener('keydown', handler)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

// Renders notebook picker rows into a container element
function buildPickerRows(notebooks, mode) {
  return notebooks.map(nb => `
    <div class="note-nb-pick-item" data-id="${nb.id}" data-name="${escHtml(nb.name)}">
      ${mode === 'multi'
        ? `<input type="checkbox" class="note-nb-pick-check" id="nb-check-${nb.id}" data-id="${nb.id}" />`
        : `<span class="note-nb-pick-radio-dot"></span>`
      }
      <label class="note-nb-pick-label" for="nb-check-${nb.id}">
        <span class="note-nb-pick-name">${escHtml(nb.name)}</span>
        <span class="note-nb-pick-count">${nb.notes.length} note${nb.notes.length !== 1 ? 's' : ''}</span>
      </label>
    </div>
  `).join('')
}

function attachPickerSearch(searchInput, listEl, allNotebooks, mode) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase()
    const filtered = q
      ? allNotebooks.filter(nb => nb.name.toLowerCase().includes(q))
      : allNotebooks
    listEl.innerHTML = buildPickerRows(filtered, mode)
    if (mode === 'single') attachSingleSelect(listEl)
  })
}

function attachSingleSelect(listEl) {
  listEl.querySelectorAll('.note-nb-pick-item').forEach(item => {
    item.addEventListener('click', () => {
      listEl.querySelectorAll('.note-nb-pick-item').forEach(i => i.classList.remove('selected'))
      item.classList.add('selected')
    })
  })
}

// ── 2.1 Rename Note ───────────────────────────────────────────────────────────

export function showRenameNoteModal(note, notebookId, onRenamed) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rennote-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="rennote-title">Rename Note</h2>
          <button class="settings-close" id="btn-rennote-close" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <label class="settings-label" for="rename-note-input">Note Title</label>
          <input
            type="text"
            id="rename-note-input"
            class="settings-input"
            value="${escHtml(note.title)}"
            autocomplete="off"
            maxlength="120"
          />
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-rennote-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-rennote-save">Save</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const input = overlay.querySelector('#rename-note-input')
  input.focus()
  input.select()

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-rennote-close').addEventListener('click', close)
  overlay.querySelector('#btn-rennote-cancel').addEventListener('click', close)

  overlay.querySelector('#btn-rennote-save').addEventListener('click', () => {
    const newTitle = input.value.trim()
    if (!newTitle) {
      input.focus()
      input.style.borderColor = 'var(--color-danger, #f87171)'
      input.addEventListener('input', () => { input.style.borderColor = '' }, { once: true })
      return
    }
    try {
      renameNoteInNotebook(notebookId, note.id, newTitle)
      showToast(`Note renamed to "${newTitle}"`, 'success')
      close()
      onRenamed?.(newTitle)
    } catch (err) {
      showToast(`Failed to rename: ${err.message}`, 'error')
    }
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#btn-rennote-save').click()
  })
}

// ── 2.2 Delete Note Confirmation ──────────────────────────────────────────────

export function showDeleteNoteConfirm(note, onDeleted) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delnote-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="delnote-title">Delete Note</h2>
          <button class="settings-close" id="btn-delnote-close" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <p style="color:var(--text-secondary);font-size:0.875rem;line-height:1.6;margin:0;">
            Are you sure you want to delete
            <strong style="color:var(--text-primary);">"${escHtml(note.title)}"</strong>?
            <br/>This action cannot be undone.
          </p>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-delnote-cancel">Cancel</button>
          <button class="btn btn-note-danger" id="btn-delnote-confirm">Delete</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-delnote-close').addEventListener('click', close)
  overlay.querySelector('#btn-delnote-cancel').addEventListener('click', close)

  overlay.querySelector('#btn-delnote-confirm').addEventListener('click', () => {
    close()
    onDeleted?.()
  })
}

// ── 2.3 Move Note ─────────────────────────────────────────────────────────────

export function showMoveNoteModal(note, sourceNotebookId, onMoved) {
  const allNotebooks = fetchNotebooks().filter(nb => nb.id !== Number(sourceNotebookId))

  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="movenote-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="movenote-title">Move Note to...</h2>
          <button class="settings-close" id="btn-movenote-close" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <input
            type="text"
            id="move-notebook-search"
            class="settings-input"
            placeholder="Search notebooks..."
            autocomplete="off"
            style="margin-bottom:8px;"
          />
          <div class="note-nb-pick-list" id="move-notebook-list">
            ${allNotebooks.length
              ? buildPickerRows(allNotebooks, 'single')
              : `<div class="note-nb-pick-empty">No other notebooks available.</div>`
            }
          </div>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-movenote-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-movenote-confirm" disabled>Move Note</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const listEl   = overlay.querySelector('#move-notebook-list')
  const searchEl = overlay.querySelector('#move-notebook-search')
  const confirmBtn = overlay.querySelector('#btn-movenote-confirm')

  attachSingleSelect(listEl)
  attachPickerSearch(searchEl, listEl, allNotebooks, 'single')

  // Re-attach select + enable button after each search re-render
  listEl.addEventListener('click', () => {
    confirmBtn.disabled = !listEl.querySelector('.note-nb-pick-item.selected')
  })

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-movenote-close').addEventListener('click', close)
  overlay.querySelector('#btn-movenote-cancel').addEventListener('click', close)

  confirmBtn.addEventListener('click', () => {
    const selected = listEl.querySelector('.note-nb-pick-item.selected')
    if (!selected) return
    const targetId = Number(selected.dataset.id)
    const targetName = selected.dataset.name
    try {
      moveNote(sourceNotebookId, note.id, targetId)
      showToast(`Note moved to "${targetName}"`, 'success')
      close()
      onMoved?.()
    } catch (err) {
      showToast(`Failed to move: ${err.message}`, 'error')
    }
  })

  searchEl.focus()
}

// ── 2.4 Copy Note ─────────────────────────────────────────────────────────────

export function showCopyNoteModal(note, sourceNotebookId, onCopied) {
  const allNotebooks = fetchNotebooks().filter(nb => nb.id !== Number(sourceNotebookId))

  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="copynote-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="copynote-title">Copy Note to...</h2>
          <button class="settings-close" id="btn-copynote-close" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <input
            type="text"
            id="copy-notebook-search"
            class="settings-input"
            placeholder="Search notebooks..."
            autocomplete="off"
            style="margin-bottom:8px;"
          />
          <div class="note-nb-pick-list" id="copy-notebook-list">
            ${allNotebooks.length
              ? buildPickerRows(allNotebooks, 'multi')
              : `<div class="note-nb-pick-empty">No notebooks available.</div>`
            }
          </div>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-copynote-cancel">Cancel</button>
          <button class="btn btn-primary" id="btn-copynote-confirm" disabled>Copy Note</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const listEl     = overlay.querySelector('#copy-notebook-list')
  const searchEl   = overlay.querySelector('#copy-notebook-search')
  const confirmBtn = overlay.querySelector('#btn-copynote-confirm')

  function syncConfirmState() {
    confirmBtn.disabled = !listEl.querySelector('.note-nb-pick-check:checked')
  }

  listEl.addEventListener('change', syncConfirmState)

  // Re-attach change listener after search re-render
  searchEl.addEventListener('input', () => {
    const q = searchEl.value.trim().toLowerCase()
    const filtered = q
      ? allNotebooks.filter(nb => nb.name.toLowerCase().includes(q))
      : allNotebooks
    listEl.innerHTML = buildPickerRows(filtered, 'multi')
    syncConfirmState()
  })

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-copynote-close').addEventListener('click', close)
  overlay.querySelector('#btn-copynote-cancel').addEventListener('click', close)

  confirmBtn.addEventListener('click', () => {
    const checked = [...listEl.querySelectorAll('.note-nb-pick-check:checked')]
    const targetIds = checked.map(cb => Number(cb.dataset.id))
    if (!targetIds.length) return
    try {
      copyNote(sourceNotebookId, note.id, targetIds)
      const label = targetIds.length === 1
        ? `"${checked[0].closest('.note-nb-pick-item').dataset.name}"`
        : `${targetIds.length} notebooks`
      showToast(`Note copied to ${label}`, 'success')
      close()
      onCopied?.()
    } catch (err) {
      showToast(`Failed to copy: ${err.message}`, 'error')
    }
  })

  searchEl.focus()
}
