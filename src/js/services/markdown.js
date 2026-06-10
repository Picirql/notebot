import { marked } from 'marked'
import katex from 'katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    // marked v12 passes (code, language, isEscaped) — NOT a token object
    code(code, language) {
      const lang = language && hljs.getLanguage(language) ? language : 'plaintext'
      const highlighted = hljs.highlight(String(code), { language: lang, ignoreIllegals: true }).value
      return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`
    },
  },
})

export function renderMarkdown(text) {
  if (!text) return ''

  const mathBlocks = []

  // Extract $$...$$ display math before marked touches it
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    mathBlocks.push({ display: true, tex: tex.trim() })
    return `\x02MATH${mathBlocks.length - 1}\x03`
  })

  // Extract $...$ inline math (single dollar, not adjacent to another $)
  processed = processed.replace(/(?<!\$)\$(?!\$)((?:[^$\n\\]|\\.)+?)(?<!\$)\$(?!\$)/g, (_, tex) => {
    mathBlocks.push({ display: false, tex: tex.trim() })
    return `\x02MATH${mathBlocks.length - 1}\x03`
  })

  // Parse markdown
  let html = marked.parse(processed)

  // Restore math with KaTeX rendering
  html = html.replace(/\x02MATH(\d+)\x03/g, (_, idx) => {
    const block = mathBlocks[Number(idx)]
    if (!block) return ''
    try {
      return katex.renderToString(block.tex, {
        displayMode: block.display,
        throwOnError: false,
        strict: false,
      })
    } catch {
      return block.display ? `$$${block.tex}$$` : `$${block.tex}$`
    }
  })

  return html
}
