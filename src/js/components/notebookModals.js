import { showToast } from './toast.js'
import {
  saveNotebook,
  updateNotebook,
  deleteNotebook,
} from '../services/api.js'

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

function closeModal(overlay) {
  overlay.remove()
}

function onEscClose(overlay) {
  function handler(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handler) }
  }
  document.addEventListener('keydown', handler)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
}

// ── 2.1 Create Notebook ───────────────────────────────────────────────────────

export function showCreateNotebookModal(onCreated) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cn-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="cn-title">New Notebook</h2>
          <button class="settings-close" id="btn-cancel-create-notebook" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <label class="settings-label" for="notebook-name-input">Notebook Name</label>
          <input
            type="text"
            id="notebook-name-input"
            class="settings-input"
            placeholder="Enter notebook name..."
            autocomplete="off"
            maxlength="80"
          />
          <label class="settings-label" for="notebook-desc-input" style="margin-top:6px;">Description</label>
          <textarea
            id="notebook-desc-input"
            class="settings-input"
            placeholder="Enter small description..."
            rows="3"
            maxlength="300"
            style="resize:vertical;min-height:72px;line-height:1.5;"
          ></textarea>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-cancel-create-notebook-footer">Cancel</button>
          <button class="btn btn-primary" id="btn-confirm-create-notebook">Create</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const nameInput = overlay.querySelector('#notebook-name-input')
  const descInput = overlay.querySelector('#notebook-desc-input')

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-cancel-create-notebook').addEventListener('click', close)
  overlay.querySelector('#btn-cancel-create-notebook-footer').addEventListener('click', close)

  overlay.querySelector('#btn-confirm-create-notebook').addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (!name) {
      nameInput.focus()
      nameInput.style.borderColor = 'var(--color-danger, #f87171)'
      nameInput.addEventListener('input', () => { nameInput.style.borderColor = '' }, { once: true })
      return
    }
    try {
      const notebook = saveNotebook(name, descInput.value.trim())
      showToast(`Notebook "${notebook.name}" created`, 'success')
      close()
      onCreated?.(notebook)
    } catch (err) {
      showToast(`Failed to create notebook: ${err.message}`, 'error')
    }
  })

  nameInput.focus()
}

// ── 2.2 Rename Notebook ───────────────────────────────────────────────────────

export function showRenameDialog(notebook, onRenamed) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rn-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="rn-title">Rename Notebook</h2>
          <button class="settings-close" id="btn-cancel-rename" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <label class="settings-label" for="rename-notebook-input">New Name</label>
          <input
            type="text"
            id="rename-notebook-input"
            class="settings-input"
            value="${escHtml(notebook.name)}"
            autocomplete="off"
            maxlength="80"
          />
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-cancel-rename-footer">Cancel</button>
          <button class="btn btn-primary" id="btn-confirm-rename">Save</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const input = overlay.querySelector('#rename-notebook-input')
  input.focus()
  input.select()

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-cancel-rename').addEventListener('click', close)
  overlay.querySelector('#btn-cancel-rename-footer').addEventListener('click', close)

  overlay.querySelector('#btn-confirm-rename').addEventListener('click', () => {
    const name = input.value.trim()
    if (!name) {
      input.focus()
      input.style.borderColor = 'var(--color-danger, #f87171)'
      input.addEventListener('input', () => { input.style.borderColor = '' }, { once: true })
      return
    }
    try {
      const updated = updateNotebook(notebook.id, { name })
      showToast(`Renamed to "${updated.name}"`, 'success')
      close()
      onRenamed?.(updated)
    } catch (err) {
      showToast(`Failed to rename: ${err.message}`, 'error')
    }
  })
}

// ── 2.3 View / Change Description ────────────────────────────────────────────

export function showDescriptionModal(notebook, onUpdated) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="desc-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="desc-title">Notebook Description — ${escHtml(notebook.name)}</h2>
          <button class="settings-close" id="btn-close-desc" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <div id="desc-view" style="
            color: var(--text-secondary);
            font-size: 0.875rem;
            line-height: 1.6;
            min-height: 48px;
            white-space: pre-wrap;
          ">${escHtml(notebook.description) || '<span style="color:var(--text-muted)">No description.</span>'}</div>
          <textarea
            id="desc-edit-input"
            class="settings-input hidden"
            rows="4"
            maxlength="300"
            style="resize:vertical;min-height:90px;line-height:1.5;"
          >${escHtml(notebook.description)}</textarea>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-toggle-desc-edit">Edit Description</button>
          <button class="btn btn-primary hidden" id="btn-save-desc">Save Changes</button>
          <button class="btn" id="btn-cancel-desc-edit hidden">Cancel</button>
          <button class="btn" id="btn-close-desc-footer">Close</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  const view      = overlay.querySelector('#desc-view')
  const editInput = overlay.querySelector('#desc-edit-input')
  const toggleBtn = overlay.querySelector('#btn-toggle-desc-edit')
  const saveBtn   = overlay.querySelector('#btn-save-desc')
  const cancelBtn = overlay.querySelector('#btn-cancel-desc-edit')

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-close-desc').addEventListener('click', close)
  overlay.querySelector('#btn-close-desc-footer').addEventListener('click', close)

  toggleBtn.addEventListener('click', () => {
    view.classList.add('hidden')
    editInput.classList.remove('hidden')
    saveBtn.classList.remove('hidden')
    cancelBtn.classList.remove('hidden')
    toggleBtn.classList.add('hidden')
    editInput.focus()
  })

  cancelBtn.addEventListener('click', () => {
    editInput.classList.add('hidden')
    saveBtn.classList.add('hidden')
    cancelBtn.classList.add('hidden')
    toggleBtn.classList.remove('hidden')
    view.classList.remove('hidden')
    editInput.value = notebook.description ?? ''
  })

  saveBtn.addEventListener('click', () => {
    const description = editInput.value.trim()
    try {
      const updated = updateNotebook(notebook.id, { description })
      notebook.description = updated.description
      view.innerHTML = description
        ? escHtml(description)
        : '<span style="color:var(--text-muted)">No description.</span>'
      editInput.classList.add('hidden')
      saveBtn.classList.add('hidden')
      cancelBtn.classList.add('hidden')
      toggleBtn.classList.remove('hidden')
      view.classList.remove('hidden')
      showToast('Description updated', 'success')
      onUpdated?.(updated)
    } catch (err) {
      showToast(`Failed to update: ${err.message}`, 'error')
    }
  })
}

// ── 2.4 Delete Confirmation ───────────────────────────────────────────────────

export function showDeleteConfirm(notebook, onDeleted) {
  const overlay = injectModal(`
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div class="settings-card">
        <div class="settings-card-header">
          <h2 class="settings-title" id="del-title">Delete Notebook</h2>
          <button class="settings-close" id="btn-cancel-del-x" aria-label="Close">×</button>
        </div>
        <div class="settings-card-body">
          <p style="color:var(--text-secondary);font-size:0.875rem;line-height:1.6;margin:0;">
            Are you sure you want to delete
            <strong style="color:var(--text-primary);">"${escHtml(notebook.name)}"</strong>?
            This will permanently remove the notebook and all its notes.
          </p>
        </div>
        <div class="settings-card-footer">
          <button class="btn" id="btn-cancel-del">Cancel</button>
          <button class="btn btn-danger" id="btn-confirm-del"
            style="background:transparent;border-color:var(--color-danger,#f87171);color:var(--color-danger,#f87171);"
          >Delete</button>
        </div>
      </div>
    </div>
  `)

  onEscClose(overlay)

  function close() { closeModal(overlay) }

  overlay.querySelector('#btn-cancel-del-x').addEventListener('click', close)
  overlay.querySelector('#btn-cancel-del').addEventListener('click', close)

  overlay.querySelector('#btn-confirm-del').addEventListener('click', () => {
    try {
      deleteNotebook(notebook.id)
      showToast(`"${notebook.name}" deleted`, 'success')
      close()
      onDeleted?.(notebook.id)
    } catch (err) {
      showToast(`Failed to delete: ${err.message}`, 'error')
    }
  })
}
