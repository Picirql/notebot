// Renders #note-content to a PDF and adds a clickable bookmarks/outline panel
// (one entry per "##" section) so readers can jump straight to a section.
// Page numbers are estimated from each heading's vertical position relative
// to the page height — close, but not pixel-exact, since html2canvas/jsPDF
// don't expose per-element page placement directly.
export async function exportNotesToPdf(contentEl, filename) {
  const { default: html2pdf } = await import('html2pdf.js')

  const clone = contentEl.cloneNode(true)
  // Strip in-app anchor links — a PDF page-jump isn't possible via these,
  // and leaving them in turns them into links back to the web app.
  clone.querySelectorAll('a[href^="#"]').forEach((a) => a.removeAttribute('href'))
  clone.style.position = 'fixed'
  clone.style.top = '-10000px'
  clone.style.left = '0'
  clone.style.width = `${contentEl.offsetWidth}px`
  document.body.appendChild(clone)

  try {
    const worker = html2pdf().set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    }).from(clone)

    const pdf = await worker.toPdf().get('pdf')
    const pageSize = await worker.get('pageSize')

    const cloneRect = clone.getBoundingClientRect()
    clone.querySelectorAll('h2[id]').forEach((heading) => {
      const offsetTop = heading.getBoundingClientRect().top - cloneRect.top
      const mmY = (offsetTop * pageSize.inner.width) / cloneRect.width
      const pageNumber = Math.max(1, Math.floor(mmY / pageSize.inner.height) + 1)
      pdf.outline.add(null, heading.textContent.trim(), { pageNumber })
    })

    pdf.save(filename)
  } finally {
    clone.remove()
  }
}
