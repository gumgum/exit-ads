import assert from 'node:assert/strict'
import { test } from 'node:test'
import { frameAt, nextMoment, MOMENTS, TIMING } from '../scenarios.js'

test('each moment follows reader action, detection, ad, and return in that order', () => {
  MOMENTS.forEach((moment, index) => {
    assert.equal(frameAt(index, 0).phase, 'action', moment.id)
    assert.equal(frameAt(index, TIMING.actionEnd - 1).phase, 'action')
    assert.equal(frameAt(index, TIMING.actionEnd).phase, 'detected')
    assert.equal(frameAt(index, TIMING.adStart - 1).phase, 'detected')
    assert.equal(frameAt(index, TIMING.adStart).phase, 'ad')
    assert.equal(frameAt(index, TIMING.resumeStart - 1).phase, 'ad')
    assert.equal(frameAt(index, TIMING.resumeStart).phase, 'resume')
    assert.equal(frameAt(index, TIMING.actionEnd).event, moment.detected)
    assert.equal(frameAt(index, TIMING.adStart).event, 'Your brand takes the spotlight')
    assert.equal(frameAt(index, TIMING.resumeStart).event, 'Ad closed. Back to the experience.')
  })
})

test('page end advances monotonically and stops at the configured 90% example', () => {
  let previousDepth = 0
  for (let elapsed = 0; elapsed <= TIMING.duration; elapsed += 100) {
    const { depth, metric } = frameAt(0, elapsed)
    assert.ok(depth >= previousDepth && depth <= 0.9)
    assert.equal(metric, Math.round(depth * 100))
    previousDepth = depth
  }
  assert.equal(previousDepth, 0.9)
})

test('return to top first scrolls deeper, then crosses back to 10%', () => {
  assert.equal(frameAt(1, 0).depth, 0)
  assert.equal(frameAt(1, 2600).depth, 0.72)
  assert.ok(frameAt(1, 4000).depth < frameAt(1, 2600).depth)
  assert.equal(frameAt(1, TIMING.actionEnd).metric, 10)
})

test('the accelerated page timer reaches 45 seconds before showing the ad', () => {
  assert.equal(frameAt(2, 0).metric, 0)
  assert.ok(frameAt(2, 3000).metric > 0)
  assert.ok(frameAt(2, 3000).metric < 45)
  assert.equal(frameAt(2, TIMING.actionEnd).metric, 45)
  assert.equal(frameAt(2, TIMING.duration).metric, 45)
})

test('tab and app moments return to the page before detection and never show an ad while away', () => {
  for (const index of [3, 4]) {
    assert.equal(frameAt(index, 0).metric, 'Here')
    assert.equal(frameAt(index, 1449).away, false)
    assert.equal(frameAt(index, 1450).away, true)
    assert.equal(frameAt(index, 3000).metric, 'Away')
    assert.equal(frameAt(index, 4399).phase, 'action')
    assert.equal(frameAt(index, 4400).away, false)
    assert.equal(frameAt(index, 4400).metric, 'Back')
    assert.equal(frameAt(index, 4400).event, 'Welcome back to the page')
    assert.equal(frameAt(index, TIMING.adStart).away, false)
  }
})

test('the custom video example finishes before the ad appears', () => {
  assert.equal(frameAt(5, 0).metric, 0)
  assert.equal(frameAt(5, TIMING.actionEnd).metric, 100)
  assert.equal(frameAt(5, TIMING.actionEnd).phase, 'detected')
  assert.equal(frameAt(5, TIMING.adStart).action, 1)
})

test('closing is available only after the complete three-second countdown', () => {
  assert.equal(frameAt(0, TIMING.adStart).closeRemaining, 3)
  assert.equal(frameAt(0, TIMING.adStart + 999).closeRemaining, 3)
  assert.equal(frameAt(0, TIMING.adStart + 1000).closeRemaining, 2)
  assert.equal(frameAt(0, TIMING.adStart + 2999).closeRemaining, 1)
  assert.equal(frameAt(0, TIMING.adStart + TIMING.closeDelay).closeRemaining, 0)
  assert.equal(frameAt(0, TIMING.duration + 5000).closeRemaining, 0)
})

test('progress clamps at both ends and navigation wraps in both directions', () => {
  assert.equal(frameAt(0, -1000).progress, 0)
  assert.equal(frameAt(0, -1000).action, 0)
  assert.equal(frameAt(0, TIMING.duration * 2).progress, 1)
  assert.equal(frameAt(0, TIMING.duration * 2).action, 1)
  assert.equal(nextMoment(0), 1)
  assert.equal(nextMoment(5), 0)
  assert.equal(nextMoment(0, -1), 5)
})
