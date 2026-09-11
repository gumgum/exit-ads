import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { buildConfiguration, DEFAULT_VALUES, TRIGGERS } from '../config-model.js'

const build = changes => buildConfiguration({ ...DEFAULT_VALUES, ...changes })
const execute = (source, window = {}) => {
  runInNewContext(source, { window })
  let applied
  window.pbjs.setConfig = value => { applied = value }
  window.pbjs.que.at(-1)()
  return applied
}

test('default export executes and matches the documented publisher defaults', () => {
  const { config, source, enabledCount } = build()
  assert.equal(enabledCount, 5)
  assert.deepEqual(JSON.parse(JSON.stringify(execute(source))), config)
  assert.equal(config.exitAds.display.trigger.idleTime.minTime, 60000)
  assert.equal(config.exitAds.display.trigger.bottomOfPage.threshold, 90)
  assert.equal(config.exitAds.display.trigger.returnToTop.threshold, 10)
  assert.equal(config.exitAds.display.closeButton.delay, 3000)
  assert.deepEqual(config.exitAds.display.frequency, { maxTriggersPerPage: 5, maxTriggersPerSession: 5, maxTriggersPerDay: 10 })
  assert.equal(config.exitAds.adUnit.bids[0].params.zone, 'YOUR_ZONE_ID')
})

test('disabled moments are explicit and their inactive fields are ignored', () => {
  const changes = Object.fromEntries(TRIGGERS.flatMap(item => [[item.key, false], [`${item.key}Value`, 'invalid']]))
  const { config, enabledCount } = build(changes)
  assert.equal(enabledCount, 0)
  for (const value of Object.values(config.exitAds.display.trigger)) assert.deepEqual(value, { enabled: false })
})

test('converts seconds, preserves zero caps, trims IDs, and supports each banner size', () => {
  for (const [size, dimensions] of Object.entries({ '300x250': [300, 250], '300x600': [300, 600], '728x90': [728, 90] })) {
    const { config } = build({ size, zone: ' zone-id ', slot: ' slot-id ', idleTimeValue: '45', tabFocusReturnValue: '2', appFocusReturnValue: '3', closeDelay: '0', perPage: '0', perSession: '2', perDay: '3' })
    assert.deepEqual(config.exitAds.adUnit.mediaTypes.banner.sizes, [dimensions])
    assert.deepEqual(config.exitAds.adUnit.bids[0].params, { zone: 'zone-id', slot: 'slot-id' })
    assert.equal(config.exitAds.display.closeButton.delay, 0)
    assert.equal(config.exitAds.display.frequency.maxTriggersPerPage, 0)
    assert.equal(config.exitAds.display.trigger.idleTime.minTime, 45000)
    assert.equal(config.exitAds.display.trigger.tabFocusReturn.minTime, 2000)
    assert.equal(config.exitAds.display.trigger.appFocusReturn.minTime, 3000)
  }
})

test('once-per-page and global-gap settings serialize as null and zero', () => {
  for (const repeat of ['null', '0']) {
    const config = execute(build({ repeat, custom: true }).source)
    for (const moment of Object.values(config.exitAds.display.trigger)) assert.equal(moment.repeatInterval, JSON.parse(repeat))
  }
})

test('custom exports register the exact event and remove the same listener on cleanup', () => {
  const event = 'quote"; window.injected=true; //\nvideo-complete'
  const calls = []
  const window = { addEventListener: (...args) => calls.push(['add', ...args]), removeEventListener: (...args) => calls.push(['remove', ...args]) }
  const originalQueue = [() => {}]
  window.pbjs = { que: originalQueue }
  const result = build({ custom: true, customEvent: event, zone: '"; window.injected=true; //' })
  const config = execute(result.source, window)
  const trigger = () => {}
  const cleanup = config.exitAds.display.trigger.custom.setup({ trigger })
  cleanup()
  assert.equal(result.enabledCount, 6)
  assert.deepEqual(calls, [['add', event, trigger], ['remove', event, trigger]])
  assert.equal(window.injected, undefined)
  assert.equal(window.pbjs.que, originalQueue)
  assert.equal(originalQueue.length, 2)
  assert.equal(config.exitAds.adUnit.bids[0].params.zone, '"; window.injected=true; //')
  assert.ok(execute(build().source, { pbjs: {} }).exitAds)
})

test('invalid settings cannot produce an export', () => {
  for (const changes of [
    { bottomOfPageValue: '101' }, { returnToTopValue: '-1' }, { idleTimeValue: '1.5' },
    { closeDelay: '' }, { perPage: 'NaN' }, { perSession: 'Infinity' },
    { perDay: '9007199254740992' }, { appFocusReturnValue: '9007199254740991' },
    { repeat: '-1' }, { size: 'native' }, { custom: true, customEvent: '  ' }
  ]) assert.throws(() => build(changes), Error)
})
