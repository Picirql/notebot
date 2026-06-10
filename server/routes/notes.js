import { Router } from 'express'
import { getAllNotes, getNoteById, updateNote, deleteNote, searchNotes } from '../db/database.js'

const router = Router()

router.get('/search', (req, res) => {
  try {
    const { q } = req.query
    if (!q || !q.trim()) return res.json([])
    res.json(searchNotes(q.trim()))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/', (_req, res) => {
  try {
    res.json(getAllNotes())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/:id', (req, res) => {
  try {
    const note = getNoteById(Number(req.params.id))
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json(note)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.put('/:id', (req, res) => {
  try {
    const note = updateNote(Number(req.params.id), req.body)
    if (!note) return res.status(404).json({ error: 'Note not found' })
    res.json(note)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.delete('/:id', (req, res) => {
  try {
    deleteNote(Number(req.params.id))
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
