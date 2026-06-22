const STORAGE_KEY = 'notebot_notebooks'

function readNotebooks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [] } catch { return [] }
}

function writeNotebooks(notebooks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notebooks))
}

// ── Network ───────────────────────────────────────────────────────────────────

export async function generateNotes(file, prompt, preset, link, notebookId) {
  const form = new FormData()
  if (file) form.append('file', file)
  if (link) form.append('link', link)
  if (prompt) form.append('prompt', prompt)
  if (preset) form.append('preset', preset)
  if (notebookId) form.append('notebookId', String(notebookId))

  const apiKey = localStorage.getItem('gemini_api_key') || ''
  const headers = {}
  if (apiKey) headers['x-api-key'] = apiKey

  let res
  try {
    res = await fetch('/api/generate', { method: 'POST', body: form, headers })
  } catch (err) {
    throw new Error(`Network error: ${err.message}`)
  }
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return res.body
}

// ── Legacy flat-note API (used by main.js / sidebar.js — kept until migrated) ──

const LEGACY_KEY = 'notebot_notes'

function readNotes() {
  try { return JSON.parse(localStorage.getItem(LEGACY_KEY)) ?? [] } catch { return [] }
}

function writeNotes(notes) {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(notes))
}

export function saveNote(note) {
  const notes = readNotes()
  const saved = {
    ...note,
    id: Date.now(),
    created_at: new Date().toISOString(),
    preview: (note.content ?? '').replace(/[#*`>_~\[\]]/g, '').trim().slice(0, 120),
  }
  notes.unshift(saved)
  writeNotes(notes)
  return saved
}

export function fetchNotes() {
  return readNotes()
}

export function fetchNote(id) {
  const note = readNotes().find(n => n.id === Number(id))
  if (!note) throw new Error(`Note ${id} not found`)
  return note
}

export function updateNote(id, { title, tags }) {
  const notes = readNotes()
  const idx = notes.findIndex(n => n.id === Number(id))
  if (idx === -1) throw new Error(`Note ${id} not found`)
  if (title !== undefined) notes[idx].title = title
  if (tags  !== undefined) notes[idx].tags  = tags
  writeNotes(notes)
  return notes[idx]
}

export function deleteNote(id) {
  const notes = readNotes()
  writeNotes(notes.filter(n => n.id !== Number(id)))
  return { ok: true }
}

export function searchNotes(query) {
  const q = query.toLowerCase()
  return readNotes().filter(n =>
    n.title?.toLowerCase().includes(q) ||
    n.content?.toLowerCase().includes(q)
  )
}

// ── Notebook CRUD ─────────────────────────────────────────────────────────────

export function fetchNotebooks() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw) {
    try { return JSON.parse(raw) } catch { /* fall through */ }
  }
  writeNotebooks([])
  return []
}

export function saveNotebook(name, description) {
  const notebooks = fetchNotebooks()
  const notebook = {
    id: Date.now(),
    name,
    description,
    created_at: new Date().toISOString(),
    notes: [],
  }
  notebooks.unshift(notebook)
  writeNotebooks(notebooks)
  return notebook
}

export function updateNotebook(id, { name, description } = {}) {
  const notebooks = readNotebooks()
  const idx = notebooks.findIndex(nb => nb.id === Number(id))
  if (idx === -1) throw new Error(`Notebook ${id} not found`)
  if (name        !== undefined) notebooks[idx].name        = name
  if (description !== undefined) notebooks[idx].description = description
  writeNotebooks(notebooks)
  return notebooks[idx]
}

export function deleteNotebook(id) {
  const notebooks = readNotebooks()
  writeNotebooks(notebooks.filter(nb => nb.id !== Number(id)))
  return { ok: true }
}

// ── Note CRUD (within a notebook) ────────────────────────────────────────────

export function saveNoteToNotebook(notebookId, note) {
  const notebooks = readNotebooks()
  const idx = notebooks.findIndex(nb => nb.id === Number(notebookId))
  if (idx === -1) throw new Error(`Notebook ${notebookId} not found`)

  const saved = {
    id: note.id ?? Date.now(),
    title: note.title ?? 'Untitled',
    content: note.content ?? '',
    preview: (note.content ?? '').replace(/[#*`>_~\[\]]/g, '').trim().slice(0, 120),
    source_file: note.source_file ?? '',
    preset: note.preset ?? '',
    prompt: note.prompt ?? '',
    segment_count: note.segment_count ?? null,
    duration: note.duration ?? null,
    created_at: new Date().toISOString(),
  }

  notebooks[idx].notes.unshift(saved)
  writeNotebooks(notebooks)
  return saved
}

export function deleteNoteFromNotebook(notebookId, noteId) {
  const notebooks = readNotebooks()
  const idx = notebooks.findIndex(nb => nb.id === Number(notebookId))
  if (idx === -1) throw new Error(`Notebook ${notebookId} not found`)
  notebooks[idx].notes = notebooks[idx].notes.filter(n => n.id !== Number(noteId))
  writeNotebooks(notebooks)
  return { ok: true }
}

export async function chatWithNotebook(notebookId, message) {
  const apiKey = localStorage.getItem('gemini_api_key') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({ notebookId, message }),
  })
  if (!res.ok) throw new Error(`Server error ${res.status}`)
  return res.body
}

export async function syncNotebookNotes(notebookId, notes) {
  const apiKey = localStorage.getItem('gemini_api_key') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['x-api-key'] = apiKey

  const res = await fetch('/api/sync', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      notebookId,
      notes: notes.map(n => ({ id: n.id, content: n.content })),
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Server error ${res.status}`)
  }
  return res.json()
}

export async function deleteNoteVectors(noteId) {
  try {
    await fetch(`/api/notes/${noteId}/vectors`, { method: 'DELETE' })
  } catch { /* best-effort; never block the local delete */ }
}

export function renameNoteInNotebook(notebookId, noteId, newTitle) {
  const notebooks = readNotebooks()
  const nbIdx = notebooks.findIndex(nb => nb.id === Number(notebookId))
  if (nbIdx === -1) throw new Error(`Notebook ${notebookId} not found`)
  const note = notebooks[nbIdx].notes.find(n => n.id === Number(noteId))
  if (!note) throw new Error(`Note ${noteId} not found`)
  note.title = newTitle
  writeNotebooks(notebooks)
  return note
}

export function moveNote(sourceNotebookId, noteId, targetNotebookId) {
  const notebooks = readNotebooks()
  const srcIdx = notebooks.findIndex(nb => nb.id === Number(sourceNotebookId))
  const tgtIdx = notebooks.findIndex(nb => nb.id === Number(targetNotebookId))
  if (srcIdx === -1) throw new Error(`Source notebook ${sourceNotebookId} not found`)
  if (tgtIdx === -1) throw new Error(`Target notebook ${targetNotebookId} not found`)
  const noteIdx = notebooks[srcIdx].notes.findIndex(n => n.id === Number(noteId))
  if (noteIdx === -1) throw new Error(`Note ${noteId} not found`)
  const [note] = notebooks[srcIdx].notes.splice(noteIdx, 1)
  notebooks[tgtIdx].notes.unshift(note)
  writeNotebooks(notebooks)
  return note
}

export function copyNote(sourceNotebookId, noteId, targetNotebookIds) {
  const notebooks = readNotebooks()
  const srcIdx = notebooks.findIndex(nb => nb.id === Number(sourceNotebookId))
  if (srcIdx === -1) throw new Error(`Source notebook ${sourceNotebookId} not found`)
  const note = notebooks[srcIdx].notes.find(n => n.id === Number(noteId))
  if (!note) throw new Error(`Note ${noteId} not found`)
  for (const targetId of targetNotebookIds) {
    const tgtIdx = notebooks.findIndex(nb => nb.id === Number(targetId))
    if (tgtIdx === -1) continue
    notebooks[tgtIdx].notes.unshift({ ...note, id: Date.now() + Math.random() })
  }
  writeNotebooks(notebooks)
  return { ok: true }
}
