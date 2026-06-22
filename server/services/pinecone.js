import 'dotenv/config'
import { Pinecone } from '@pinecone-database/pinecone'
import { getEmbedding } from './embeddings.js'

// Lazy singleton — initialized on first use so env vars are guaranteed loaded
let _index = null

function getIndex() {
  if (_index) return _index
  const apiKey = process.env.PINECONE_API_KEY
  if (!apiKey) throw new Error('PINECONE_API_KEY is not set')

  const raw = process.env.PINECONE_INDEX || ''
  if (!raw) throw new Error('PINECONE_INDEX is not set')

  const pc = new Pinecone({ apiKey })

  // Accept either a full URL (https://host) or a bare index name
  if (raw.startsWith('http')) {
    const host = raw.replace(/^https?:\/\//, '')
    // Derive the index name from the host prefix (strip the project-id suffix)
    const firstLabel = host.split('.')[0]          // e.g. "notebot-notes-8q4j87l"
    const indexName  = firstLabel.replace(/-[a-z0-9]{7}$/, '') || firstLabel
    _index = pc.index(indexName, host)
  } else {
    _index = pc.index(raw)
  }

  return _index
}

export async function upsertNoteChunks(notebookId, noteId, chunks) {
  if (!chunks.length) return
  const index = getIndex()
  const records = []
  for (let i = 0; i < chunks.length; i++) {
    const { text, tags } = chunks[i]
    const values = await getEmbedding(text)
    records.push({
      id: `note_${noteId}_chunk_${i}`,
      values,
      metadata: {
        notebook_id: String(notebookId),
        note_id:     String(noteId),
        text,
        subject:       String(tags?.subject       ?? ''),
        chapter_topic: String(tags?.chapter_topic  ?? ''),
        type:          String(tags?.type           ?? ''),
        importance:    String(tags?.importance     ?? ''),
      },
    })
  }
  await index.upsert({ records })
}

export async function queryNotebookContext(notebookId, queryVector, limit = 5) {
  const index = getIndex()
  const result = await index.query({
    vector: queryVector,
    topK: limit,
    filter: { notebook_id: { $eq: String(notebookId) } },
    includeMetadata: true,
  })
  return result.matches
}

export async function deleteNoteFromPinecone(noteId) {
  const index = getIndex()
  let paginationToken
  const ids = []

  do {
    const page = await index.listPaginated({
      prefix: `note_${noteId}_chunk_`,
      ...(paginationToken ? { paginationToken } : {}),
    })
    if (page.vectors) ids.push(...page.vectors.map(v => v.id))
    paginationToken = page.pagination?.next
  } while (paginationToken)

  if (ids.length) await index.deleteMany(ids)
}
