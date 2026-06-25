import html2pdf from 'html2pdf.js'

export async function exportNotesToPdf(contentEl, filename) {
  // Clone and attach directly to <body> so html2canvas isn't clipped by any
  // overflow:auto/hidden ancestor, and isn't hidden by off-screen positioning.
  const clone = contentEl.cloneNode(true)
  clone.style.cssText = [
    'position:absolute',
    'left:-9999px',
    'top:0',
    'width:800px',
    'background:#fff',
    'color:#000',
    'padding:32px',
    'font-family:Inter,sans-serif',
    'font-size:14px',
    'line-height:1.6',
  ].join(';')
  document.body.appendChild(clone)

  // Strip internal anchor hrefs so jsPDF doesn't choke on them
  clone.querySelectorAll('a[href^="#"]').forEach(a => a.removeAttribute('href'))

  try {
    const worker = html2pdf().set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 1, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone)

    const pdf = await worker.toPdf().get('pdf')

    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const innerW = pageW - 20
    const innerH = pageH - 20
    const cloneRect = clone.getBoundingClientRect()

    clone.querySelectorAll('h2[id]').forEach(h => {
      const offsetTop = h.getBoundingClientRect().top - cloneRect.top
      const mmY = (offsetTop / cloneRect.width) * innerW
      const pageNumber = Math.max(1, Math.floor(mmY / innerH) + 1)
      pdf.outline.add(null, h.textContent.trim(), { pageNumber })
    })

    pdf.save(filename)
  } finally {
    document.body.removeChild(clone)
  }
}
