const PRESETS = [
  { id: 'detailed_notes', label: '📝 Notes',      prompt: 'Generate comprehensive, detailed notes from this class material.' },
  { id: 'summary',        label: '📋 Summary',    prompt: 'Create a concise summary of the key points from this class.' },
  { id: 'key_concepts',   label: '🔑 Key Concepts', prompt: 'Extract and explain all key concepts and definitions.' },
  { id: 'flashcards',     label: '🃏 Flashcards', prompt: 'Create Q&A flashcard pairs for studying this material.' },
  { id: 'study_guide',    label: '📚 Study Guide', prompt: 'Create a structured study guide from this material.' },
  { id: 'formula_sheet',  label: '🧮 Formulas',   prompt: 'Extract all formulas and equations into a reference sheet.' },
]

let activePresetId = 'detailed_notes'

export function render() {
  const pills = PRESETS.map(p => `
    <button
      class="preset-pill${p.id === activePresetId ? ' active' : ''}"
      data-preset-id="${p.id}"
      data-preset-prompt="${escAttr(p.prompt)}"
    >${p.label}</button>
  `).join('')

  return `
    <div class="prompt-section">
      <div class="presets-row">${pills}</div>
      <label class="prompt-label" for="prompt-textarea">Custom instructions (optional)</label>
      <textarea
        id="prompt-textarea"
        class="prompt-textarea"
        placeholder="Describe how you want the notes generated..."
      >${escHtml(PRESETS[0].prompt)}</textarea>
      <button class="btn-generate" id="btn-generate" disabled>✨ Generate Notes</button>
    </div>
  `
}

export function init(onGenerate) {
  const pills = document.querySelectorAll('.preset-pill')
  const textarea = document.getElementById('prompt-textarea')
  const btn = document.getElementById('btn-generate')

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'))
      pill.classList.add('active')
      activePresetId = pill.dataset.presetId
      textarea.value = pill.dataset.presetPrompt
    })
  })

  btn.addEventListener('click', () => {
    if (!btn.disabled && !btn.classList.contains('loading')) {
      onGenerate(textarea.value.trim(), activePresetId)
    }
  })
}

export function setEnabled(bool) {
  const btn = document.getElementById('btn-generate')
  if (btn) btn.disabled = !bool
}

export function setLoading(bool) {
  const btn = document.getElementById('btn-generate')
  if (!btn) return
  if (bool) {
    btn.classList.add('loading')
    btn.disabled = true
    btn.textContent = 'Generating...'
  } else {
    btn.classList.remove('loading')
    btn.disabled = false
    btn.textContent = '✨ Generate Notes'
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
