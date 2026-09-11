import { readFileSync } from 'node:fs'
import { parse } from 'node-html-parser'

// Bind the controllers to real HTML fields; simulate only the browser APIs.
export const guideFixture = page => {
  const html = parse(readFileSync(new URL(`../${page}`, import.meta.url), 'utf8'), { parseNoneClosedTags: true, blockTextElements: { script: true, style: true } })
  const wrappers = new Map()
  const listeners = new Map()
  const links = []
  const wrap = node => {
    if (!node) return null
    if (wrappers.has(node)) return wrappers.get(node)
    const events = new Map()
    const classes = new Set((node.getAttribute('class') || '').split(' '))
    const element = {
      name: node.getAttribute('name'),
      type: node.getAttribute('type'),
      value: node.getAttribute('value') ?? node.querySelector('option')?.getAttribute('value') ?? '',
      checked: node.hasAttribute('checked'),
      disabled: node.hasAttribute('disabled'),
      textContent: node.textContent,
      dataset: { copy: node.getAttribute('data-copy') },
      classList: { toggle: (key, on) => on ? classes.add(key) : classes.delete(key), add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key) },
      getAttribute: key => node.getAttribute(key),
      setAttribute: (key, value) => node.setAttribute(key, value),
      closest: selector => wrap(node.closest(selector)),
      addEventListener: (key, handler) => events.set(key, handler),
      fire: (key, event = {}) => events.get(key)?.(event),
      focus () { doc.activeElement = element }
    }
    wrappers.set(node, element)
    return element
  }
  const doc = {
    activeElement: null,
    getElementById: id => wrap(html.querySelector(`#${id}`)),
    querySelector: selector => wrap(html.querySelector(selector)),
    querySelectorAll: selector => html.querySelectorAll(selector).map(wrap),
    addEventListener: (key, handler) => listeners.set(key, handler),
    fire: (key, event) => listeners.get(key)?.(event),
    createElement: () => { const link = { click: () => links.push(link) }; return link }
  }
  const form = doc.getElementById('configuration-form')
  if (form) {
    form.elements = doc.querySelectorAll('input, select, button')
    form.elements.namedItem = name => form.elements.find(element => element.name === name)
  }
  return { doc, links }
}
