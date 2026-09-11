import assert from 'node:assert/strict'
import { test } from 'node:test'
import { guideFixture } from './guide-fixture.js'
import { DEFAULT_VALUES, TRIGGERS } from '../config-model.js'

test('guide navigation and configuration exports work with the real form', async t => {
  const { doc, links } = guideFixture('configuration.html')
  const timers = new Map()
  let timerId = 0
  let copied
  let denied = false
  let blob
  const revoked = []
  globalThis.document = doc
  globalThis.window = {
    navigator: { clipboard: { writeText: async text => { if (denied) throw new Error('denied'); copied = text } } },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
    Blob,
    URL: { createObjectURL: value => { blob = value; return 'blob:configuration' }, revokeObjectURL: value => revoked.push(value) }
  }
  t.after(() => { delete globalThis.document; delete globalThis.window })
  await import('../navigation.js')
  await import('../configurator.js')
  const get = doc.getElementById
  const form = get('configuration-form')
  const copy = doc.querySelector('[data-copy="configuration-code"]')
  const update = (name, value) => {
    const element = form.elements.namedItem(name)
    if (element.type === 'checkbox') element.checked = value
    else element.value = value
    form.fire('input')
  }

  await t.test('HTML defaults and generated settings agree', () => {
    for (const [name, value] of Object.entries(DEFAULT_VALUES)) {
      const field = form.elements.namedItem(name)
      assert.equal(field.type === 'checkbox' ? field.checked : field.value, value, name)
    }
    assert.equal(get('configuration-summary').textContent, '5 moments enabled')
    assert.equal(get('customEvent').disabled, true)
    assert.equal(copy.disabled, false)
    let prevented = false
    form.fire('submit', { preventDefault: () => { prevented = true } })
    assert.equal(prevented, true)
  })

  await t.test('mobile navigation opens, closes on Escape, and closes on a link', () => {
    const menu = doc.querySelector('.menu-toggle')
    const nav = doc.querySelector('.site-nav')
    menu.fire('click')
    assert.equal(menu.getAttribute('aria-expanded'), 'true')
    assert.equal(nav.classList.contains('is-open'), true)
    doc.fire('keydown', { key: 'Tab' })
    assert.equal(menu.getAttribute('aria-expanded'), 'true')
    doc.fire('keydown', { key: 'Escape' })
    assert.equal(doc.activeElement, menu)
    assert.equal(menu.getAttribute('aria-label'), 'Open navigation')
    doc.fire('keydown', { key: 'Escape' })
    menu.fire('click')
    nav.fire('click', { target: nav })
    assert.equal(menu.getAttribute('aria-expanded'), 'true')
    nav.fire('click', { target: doc.querySelector('.site-nav a') })
    assert.equal(menu.getAttribute('aria-expanded'), 'false')
  })

  await t.test('toggling moments disables dependent fields and updates the export', () => {
    for (const item of TRIGGERS) update(item.key, false)
    assert.equal(get('configuration-summary').textContent, '0 moments enabled')
    assert.match(get('configuration-status').textContent, /Automatic moments are off/)
    assert.equal(get('idleTimeValue').disabled, true)
    update('custom', true)
    assert.equal(get('configuration-summary').textContent, '1 moment enabled')
    assert.equal(get('customEvent').disabled, false)
    assert.match(get('configuration-status').textContent, /dispatch the custom event/)
    update('customEvent', 'article-complete')
    assert.match(get('configuration-code').textContent, /addEventListener\("article-complete"/)
    form.fire('change')
    assert.equal(copy.disabled, false)
  })

  await t.test('invalid input prevents copying or downloading stale configuration', () => {
    update('perPage', '-1')
    assert.equal(copy.disabled, true)
    assert.equal(get('download-configuration').disabled, true)
    assert.equal(get('configuration-status').classList.contains('field-error'), true)
    assert.match(get('configuration-status').textContent, /Page cap/)
    get('download-configuration').fire('click')
    assert.equal(links.length, 0)
    update('perPage', '2')
    assert.equal(copy.disabled, false)
    assert.equal(get('configuration-status').classList.contains('field-error'), false)
  })

  await t.test('clipboard success, reset, and unavailable-clipboard fallback are accessible', async () => {
    await copy.fire('click')
    assert.equal(copied, get('configuration-code').textContent)
    assert.equal(copy.textContent, 'Copied ✓')
    assert.match(get('copy-status').textContent, /Code copied/)
    for (const callback of timers.values()) callback()
    assert.equal(copy.textContent, 'Copy code')
    denied = true
    await copy.fire('click')
    assert.equal(doc.activeElement, get('configuration-code'))
    assert.match(get('copy-status').textContent, /Select the code/)
  })

  await t.test('download contains the current JavaScript and releases its temporary URL', async () => {
    get('download-configuration').fire('click')
    assert.equal(links[0].download, 'exit-ads-config.js')
    assert.equal(links[0].href, 'blob:configuration')
    assert.equal(blob.type, 'text/javascript')
    assert.equal(await blob.text(), get('configuration-code').textContent)
    for (const callback of timers.values()) callback()
    assert.deepEqual(revoked, ['blob:configuration'])
  })
})
