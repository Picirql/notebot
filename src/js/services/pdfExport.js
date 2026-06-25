import html2pdf from 'html2pdf.js'

export async function exportNotesToPdf(contentEl, filename) {
  // html2canvas won't capture elements that are off-screen or have a deeply
  // negative z-index. Render the content in a full-screen visible overlay so
  // the canvas capture always succeeds, then tear it down after saving.
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'background:#fff',
    'overflow-y:auto',
    'display:flex',
    'justify-content:center',
  ].join(';')

  const clone = contentEl.cloneNode(true)
  clone.style.cssText = [
    'width:800px',
    'max-width:100%',
    'padding:40px',
    'background:#fff',
    'color:#000',
    'font-family:Inter,sans-serif',
    'font-size:14px',
    'line-height:1.7',
    'animation:none',
    'opacity:1',
  ].join(';')

  clone.querySelectorAll('*').forEach(el => {
    el.style.animation = 'none'
    el.style.transition = 'none'
  })
  clone.querySelectorAll('a[href^="#"]').forEach(a => a.removeAttribute('href'))

  overlay.appendChild(clone)
  document.body.appendChild(overlay)

  try {
    await html2pdf().set({
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone).save()
  } finally {
    document.body.removeChild(overlay)
  }
}
