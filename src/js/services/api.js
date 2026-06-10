const STORAGE_KEY = 'notebot_notes'

function readNotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [] } catch { return [] }
}

function writeNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

// ── Network ───────────────────────────────────────────────────────────────────

export async function generateNotes(file, prompt, preset) {
  const form = new FormData()
  if (file) form.append('file', file)
  if (prompt) form.append('prompt', prompt)
  if (preset) form.append('preset', preset)

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

// ── Local storage CRUD ────────────────────────────────────────────────────────

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
  const filtered = notes.filter(n => n.id !== Number(id))
  writeNotes(filtered)
  return { ok: true }
}

export function searchNotes(query) {
  const q = query.toLowerCase()
  return readNotes().filter(n =>
    n.title?.toLowerCase().includes(q) ||
    n.content?.toLowerCase().includes(q)
  )
}
