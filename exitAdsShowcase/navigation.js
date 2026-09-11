const menu = document.querySelector('.menu-toggle')
const navigation = document.querySelector('.site-nav')

if (menu && navigation) {
  const setOpen = open => {
    menu.setAttribute('aria-expanded', String(open))
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation')
    navigation.classList.toggle('is-open', open)
  }
  menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'))
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      setOpen(false)
      menu.focus()
    }
  })
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) setOpen(false)
  })
}

document.querySelectorAll('[data-copy]').forEach(button => {
  let resetTimer
  button.addEventListener('click', async () => {
    const code = document.getElementById(button.dataset.copy)
    const status = document.getElementById('copy-status')
    window.clearTimeout(resetTimer)
    try {
      await window.navigator.clipboard.writeText(code.textContent)
      button.textContent = 'Copied ✓'
      if (status) status.textContent = 'Code copied to clipboard.'
      resetTimer = window.setTimeout(() => { button.textContent = 'Copy code' }, 2000)
    } catch {
      // Keep the selectable snippet visible when clipboard permission is unavailable.
      button.textContent = 'Copy code'
      if (status) status.textContent = 'Clipboard unavailable. Select the code and copy it manually.'
      code.focus()
    }
  })
})
