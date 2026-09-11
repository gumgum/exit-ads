import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'node-html-parser'
import { TIMING } from '../scenarios.js'

// Exercise the real controller against the actual page structure. Only browser
// scheduling and layout measurements are simulated; no test hooks ship to clients.
test('walkthrough controls, lifecycle, and accessibility stay synchronized', async t => {
  const html = parse(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), { parseNoneClosedTags: true })
  const wrappers = new Map()
  const pendingFrames = new Map()
  const documentListeners = new Map()
  const mediaListeners = new Map()
  let frameId = 0
  let now = 0
  let resized
  const wrap = node => {
    if (!node) return null
    if (!wrappers.has(node)) {
      const classes = new Set((node.getAttribute('class') || '').split(' '))
      const listeners = new Map()
      const attributes = new Map(Object.entries(node.attributes))
      const element = {
        textContent: node.textContent,
        dataset: {},
        style: { setProperty (key, value) { this[key] = value } },
        classList: {
          toggle (name, enabled) { if (enabled) classes.add(name); else classes.delete(name) },
          contains: name => classes.has(name)
        },
        setAttribute: (key, value) => attributes.set(key, value),
        getAttribute: key => attributes.get(key),
        removeAttribute: key => attributes.delete(key),
        addEventListener: (type, handler) => listeners.set(type, handler),
        fire: (type, event = {}) => listeners.get(type)?.(event),
        focus () { doc.activeElement = this },
        clientHeight: 322,
        offsetHeight: 46,
        scrollHeight: 750
      }
      wrappers.set(node, element)
    }
    return wrappers.get(node)
  }
  const doc = {
    hidden: false,
    activeElement: null,
    body: wrap(html.querySelector('body')),
    getElementById: id => wrap(html.querySelector(`#${id}`)),
    querySelector: selector => wrap(html.querySelector(selector)),
    querySelectorAll: selector => html.querySelectorAll(selector).map(wrap),
    addEventListener: (type, handler) => documentListeners.set(type, handler),
    fonts: { ready: Promise.resolve() }
  }
  const media = { matches: false, addEventListener: (type, handler) => mediaListeners.set(type, handler) }
  const win = {
    matchMedia: () => media,
    requestAnimationFrame: callback => { pendingFrames.set(++frameId, callback); return frameId },
    cancelAnimationFrame: id => pendingFrames.delete(id),
    ResizeObserver: class { constructor (callback) { resized = callback } observe () {} }
  }
  globalThis.document = doc
  globalThis.window = win
  t.after(() => { delete globalThis.document; delete globalThis.window })
  await import('../app.js')
  const get = doc.getElementById
  const panel = get('moment-panel')
  const button = get('playback')
  const frame = milliseconds => {
    now += milliseconds
    const callbacks = [...pendingFrames.values()]
    pendingFrames.clear()
    callbacks.forEach(callback => callback(now))
  }
  const key = (id, value) => {
    let prevented = false
    get(id).fire('keydown', { key: value, preventDefault () { prevented = true } })
    return prevented
  }

  await t.test('starts one loop, reveals the ad after detection, and enforces the close countdown', () => {
    assert.equal(pendingFrames.size, 1)
    assert.equal(panel.dataset.scene, 'bottom')
    assert.equal(get('ad-overlay').inert, true)
    get('close-ad').fire('click')
    assert.equal(panel.dataset.phase, 'action')
    frame(0)
    frame(TIMING.actionEnd)
    assert.equal(panel.dataset.phase, 'detected')
    assert.equal(get('metric-value').textContent, 90)
    frame(TIMING.adStart - TIMING.actionEnd)
    assert.equal(panel.dataset.phase, 'ad')
    assert.equal(get('ad-overlay').inert, false)
    assert.equal(get('close-ad').disabled, true)
    get('close-ad').fire('click')
    assert.equal(panel.dataset.phase, 'ad')
    frame(TIMING.closeDelay)
    assert.equal(get('close-ad').disabled, false)
    get('close-ad').focus()
    get('close-ad').fire('click')
    assert.equal(panel.dataset.phase, 'resume')
    assert.equal(get('ad-overlay').inert, true)
    assert.equal(doc.activeElement, button)
  })

  await t.test('autoplay advances and manual selection resets the old overlay', () => {
    frame(TIMING.duration - TIMING.resumeStart)
    assert.equal(panel.dataset.scene, 'top')
    assert.equal(get('scene-count').textContent, '02 / 06')
    get('tab-time').fire('click')
    frame(3200)
    assert.equal(panel.dataset.scene, 'time')
    assert.match(get('timer-readout').textContent, /^00:\d\d$/)
    assert.ok(get('metric-value').textContent > 0)
    frame(7000)
    assert.equal(panel.dataset.phase, 'ad')
    get('tab-tab').fire('click')
    assert.equal(panel.dataset.phase, 'action')
    assert.equal(get('ad-overlay').inert, true)
    frame(2000)
    assert.equal(panel.classList.contains('is-away'), true)
    assert.equal(get('mock-address').textContent, 'another-tab.example')
    frame(2600)
    assert.equal(panel.classList.contains('is-away'), false)
    assert.match(get('mock-address').textContent, /^offscript/)
    get('tab-app').fire('click')
    frame(2000)
    assert.equal(panel.dataset.scene, 'app')
    assert.equal(panel.classList.contains('is-away'), true)
  })

  await t.test('pause and document visibility never advance or duplicate the timeline', () => {
    button.fire('click')
    const metric = get('metric-value').textContent
    assert.equal(pendingFrames.size, 0)
    frame(60000)
    assert.equal(get('metric-value').textContent, metric)
    button.fire('click')
    frame(60000)
    assert.equal(get('metric-value').textContent, metric)
    doc.hidden = true
    documentListeners.get('visibilitychange')()
    assert.equal(pendingFrames.size, 0)
    doc.hidden = false
    documentListeners.get('visibilitychange')()
    assert.equal(pendingFrames.size, 1)
    button.fire('click')
    doc.hidden = true
    documentListeners.get('visibilitychange')()
    doc.hidden = false
    documentListeners.get('visibilitychange')()
    assert.equal(pendingFrames.size, 0)
    assert.equal(button.getAttribute('aria-label'), 'Play walkthrough')
  })

  await t.test('keyboard navigation wraps, updates selection, and preserves focus', () => {
    assert.equal(key('tab-app', 'End'), true)
    assert.equal(panel.dataset.scene, 'custom')
    assert.equal(doc.activeElement, get('tab-custom'))
    assert.equal(key('tab-custom', 'ArrowRight'), true)
    assert.equal(panel.dataset.scene, 'bottom')
    assert.equal(key('tab-bottom', 'ArrowLeft'), true)
    assert.equal(panel.dataset.scene, 'custom')
    assert.equal(key('tab-custom', 'Home'), true)
    assert.equal(panel.dataset.scene, 'bottom')
    assert.equal(key('tab-bottom', 'Tab'), false)
    assert.equal(get('tab-bottom').tabIndex, 0)
    assert.equal(get('tab-custom').tabIndex, -1)
    get('next-moment').fire('click')
    assert.equal(panel.dataset.scene, 'top')
  })

  await t.test('reduced motion presents a still ad with an immediately usable close button', () => {
    media.matches = true
    mediaListeners.get('change')()
    assert.equal(pendingFrames.size, 0)
    assert.equal(panel.dataset.phase, 'ad')
    assert.equal(get('close-ad').disabled, false)
    assert.equal(get('metric-value').textContent, 10)
    key('moment-panel', 'Escape')
    assert.equal(panel.dataset.phase, 'resume')
    get('tab-custom').fire('click')
    assert.equal(panel.dataset.phase, 'ad')
    assert.equal(get('video-label').textContent, 'Video complete')
    assert.equal(get('video-time').textContent, '00:30 / 00:30')
    key('moment-panel', 'a')
    assert.equal(panel.dataset.phase, 'ad')
    media.matches = false
    mediaListeners.get('change')()
    assert.equal(panel.dataset.phase, 'action')
    assert.equal(pendingFrames.size, 1)
  })

  await t.test('resizing recalculates the simulated article scroll distance', () => {
    get('tab-bottom').fire('click')
    frame(0)
    frame(TIMING.actionEnd)
    const oldPosition = get('article-scroll').style.transform
    doc.querySelector('.browser-viewport').clientHeight = 240
    resized()
    assert.notEqual(get('article-scroll').style.transform, oldPosition)
    assert.equal(get('metric-value').textContent, 90)
    assert.equal(pendingFrames.size, 1)
  })
})
