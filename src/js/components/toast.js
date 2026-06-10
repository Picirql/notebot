function ensureContainer() {
  let container = document.querySelector('.toast-container')
  if (!container) {
    container = document.createElement('div')
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  return container
}

export function showToast(message, type = 'success') {
  const container = ensureContainer()

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)

  const dismiss = () => {
    toast.style.transition = 'opacity 300ms ease, transform 300ms ease'
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(8px)'
    setTimeout(() => toast.remove(), 300)
  }

  setTimeout(dismiss, 3000)
  toast.addEventListener('click', dismiss)
}
