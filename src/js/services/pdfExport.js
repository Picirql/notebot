import html2pdf from 'html2pdf.js'

export async function exportNotesToPdf(contentEl, filename) {

  const anchors = [...contentEl.querySelectorAll('a[href^="#"]')]
  const savedHrefs = anchors.map(a => a.getAttribute('href'))
  anchors.forEach(a => a.removeAttribute('href'))

  try {
    const worker = html2pdf().set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      // scale:1 keeps the canvas small enough for large documents;
      // scale:2 would quarter the max page count before canvas overflow.
      html2canvas: { scale: 1, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(contentEl)

    const pdf = await worker.toPdf().get('pdf')

    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const innerW = pageW - 20
    const innerH = pageH - 20
    const contentRect = contentEl.getBoundingClientRect()

    contentEl.querySelectorAll('h2[id]').forEach(h => {
      const offsetTop = h.getBoundingClientRect().top - contentRect.top
      const mmY = (offsetTop / contentRect.width) * innerW
      const pageNumber = Math.max(1, Math.floor(mmY / innerH) + 1)
      pdf.outline.add(null, h.textContent.trim(), { pageNumber })
    })

    pdf.save(filename)
  } finally {
    anchors.forEach((a, i) => a.setAttribute('href', savedHrefs[i]))
  }
}
