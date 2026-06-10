import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, 'notes.db'))

db.pragma('journal_mode = WAL')

db.prepare(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_file TEXT,
    prompt TEXT,
    preset TEXT,
    tags TEXT DEFAULT '[]',
    segment_count INTEGER DEFAULT 0,
    duration TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run()

export function insertNote({ title, content, source_file, prompt, preset, segment_count, duration }) {
  const stmt = db.prepare(`
    INSERT INTO notes (title, content, source_file, prompt, preset, segment_count, duration)
    VALUES (@title, @content, @source_file, @prompt, @preset, @segment_count, @duration)
  `)
  const { lastInsertRowid } = stmt.run({ title, content, source_file, prompt, preset, segment_count, duration })
  return getNoteById(lastInsertRowid)
}

export function getAllNotes() {
  return db.prepare(`
    SELECT id, title, substr(content, 1, 150) AS preview, source_file, preset, tags,
           segment_count, duration, created_at
    FROM notes
    ORDER BY created_at DESC
  `).all()
}

export function getNoteById(id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
}

export function updateNote(id, { title, tags } = {}) {
  const fields = []
  const values = []
  if (title !== undefined) { fields.push('title = ?'); values.push(title) }
  if (tags !== undefined) {
    fields.push('tags = ?')
    values.push(typeof tags === 'string' ? tags : JSON.stringify(tags))
  }
  if (fields.length === 0) return getNoteById(id)
  values.push(id)
  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getNoteById(id)
}

export function deleteNote(id) {
  return db.prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function searchNotes(query) {
  const like = `%${query}%`
  return db.prepare(`
    SELECT id, title, substr(content, 1, 150) AS preview, source_file, preset, tags,
           segment_count, duration, created_at
    FROM notes
    WHERE title LIKE ? OR content LIKE ?
    ORDER BY created_at DESC
  `).all(like, like)
}
