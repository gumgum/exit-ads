import { buildConfiguration, TRIGGERS } from './config-model.js'

const form = document.getElementById('configuration-form')
const output = document.getElementById('configuration-code')
const summary = document.getElementById('configuration-summary')
const status = document.getElementById('configuration-status')
const copy = document.querySelector('[data-copy="configuration-code"]')
const download = document.getElementById('download-configuration')
let source = ''

const update = () => {
  const values = Object.fromEntries([...form.elements].filter(element => element.name).map(element => [element.name, element.type === 'checkbox' ? element.checked : element.value]))
  TRIGGERS.forEach(item => { form.elements.namedItem(`${item.key}Value`).disabled = !values[item.key] })
  form.elements.namedItem('customEvent').disabled = !values.custom
  try {
    const result = buildConfiguration(values)
    source = result.source
    output.textContent = source
    summary.textContent = `${result.enabledCount} ${result.enabledCount === 1 ? 'moment' : 'moments'} enabled`
    status.textContent = result.enabledCount === 0
      ? 'Automatic moments are off. You can still trigger an ad manually, subject to your frequency caps.'
      : values.custom ? 'Your site must dispatch the custom event. See the event example below.' : 'The first eligible moment can show an ad. Frequency caps apply across all moments.'
    status.classList.remove('field-error')
    copy.disabled = false
    download.disabled = false
  } catch (error) {
    source = ''
    output.textContent = '// Correct the invalid setting to generate your configuration.'
    summary.textContent = 'Check your settings'
    status.textContent = error.message
    status.classList.add('field-error')
    copy.disabled = true
    download.disabled = true
  }
}

form.addEventListener('input', update)
form.addEventListener('change', update)
form.addEventListener('submit', event => event.preventDefault())
download.addEventListener('click', () => {
  if (!source) return
  const url = window.URL.createObjectURL(new window.Blob([source], { type: 'text/javascript' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'exit-ads-config.js'
  link.click()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
})
update()
