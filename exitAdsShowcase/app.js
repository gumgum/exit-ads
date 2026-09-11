import { MOMENTS, TIMING, frameAt, nextMoment } from './scenarios.js'

const find = id => document.getElementById(id)
const panel = find('moment-panel')
const tabs = [...document.querySelectorAll('.moment-tab')]
const steps = [...document.querySelectorAll('.story-step')]
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
const overlay = find('ad-overlay')
const closeButton = find('close-ad')
let momentIndex = 0
let elapsed = 0
let playing = !reducedMotion.matches
let lastTime = null
let animationId
let previousPhase
let previousEvent
let scrollDistance = 0

/**
 * Recalculate the simulated scroll range after responsive layout or font changes.
 */
function measureArticle () {
  scrollDistance = Math.max(0, find('article-scroll').scrollHeight - (document.querySelector('.browser-viewport').clientHeight - document.querySelector('.publisher-header').offsetHeight))
  render()
}

/**
 * Paint one synchronized frame without advancing the timeline.
 */
function render () {
  const state = frameAt(momentIndex, elapsed)
  const moment = MOMENTS[momentIndex]
  panel.dataset.phase = state.phase
  panel.classList.toggle('is-away', state.away)
  panel.classList.toggle('has-returned', elapsed >= 4400)
  panel.style.setProperty('--action', state.action)
  panel.style.setProperty('--creative-progress', Math.min(1, Math.max(0, (elapsed - TIMING.adStart) / 900)))
  find('article-scroll').style.transform = `translateY(${-state.depth * scrollDistance}px)`
  find('scroll-thumb').style.top = `${state.depth * 83}%`
  find('metric-value').textContent = state.metric
  find('metric-value').classList.toggle('word-metric', typeof state.metric === 'string')
  find('timer-readout').textContent = `00:${String(Math.round(state.action * 45)).padStart(2, '0')}`
  find('timer-ring').style.strokeDashoffset = 170 * (1 - state.action)
  find('video-progress').style.transform = `scaleX(${state.action})`
  find('video-time').textContent = `00:${String(Math.round(state.action * 30)).padStart(2, '0')} / 00:30`
  find('video-label').textContent = state.action === 1 ? 'Video complete' : 'The adventure, in motion'
  find('playback-progress').style.transform = `scaleX(${state.progress})`
  find('mock-address').textContent = moment.id === 'tab' && state.away ? 'another-tab.example' : 'offscript.example / explore / the-great-outdoors'
  overlay.inert = state.phase !== 'ad'
  closeButton.disabled = state.closeRemaining > 0
  closeButton.textContent = state.closeRemaining > 0 ? state.closeRemaining : '×'
  closeButton.setAttribute('aria-label', state.closeRemaining > 0 ? `Close available in ${state.closeRemaining} seconds` : 'Close example ad')
  if (previousEvent !== state.event) {
    find('event-text').textContent = state.event
    previousEvent = state.event
  }
  if (previousPhase !== state.phase) {
    if (state.phase !== 'ad' && document.activeElement === closeButton) find('playback').focus({ preventScroll: true })
    const activeStep = state.phase === 'resume' ? 2 : ['action', 'detected', 'ad'].indexOf(state.phase)
    steps.forEach((step, index) => {
      step.classList.toggle('active', index === activeStep)
      step.classList.toggle('complete', index < activeStep)
      if (index === activeStep) step.setAttribute('aria-current', 'step')
      else step.removeAttribute('aria-current')
    })
    if (state.phase !== 'action') find('announcement').textContent = `${moment.title.replace('\n', ' ')} ${state.event}`
    previousPhase = state.phase
  }
}

/**
 * Select a moment and reset its timeline.
 * @param {number} index Index of the selected moment.
 * @param {boolean} focusTab Whether keyboard navigation should move focus.
 */
function selectMoment (index, focusTab = false) {
  momentIndex = index
  // With reduced motion, selecting a moment shows its completed, still example.
  elapsed = reducedMotion.matches && !playing ? TIMING.adStart + TIMING.closeDelay : 0
  previousPhase = undefined
  const moment = MOMENTS[index]
  panel.dataset.scene = moment.id
  panel.setAttribute('aria-labelledby', `tab-${moment.id}`)
  find('scene-title').textContent = moment.title
  find('scene-category').textContent = moment.category
  find('scene-description').textContent = moment.description
  find('scene-setting').textContent = moment.setting
  find('scene-number').textContent = String(index + 1).padStart(2, '0')
  find('scene-count').textContent = `${String(index + 1).padStart(2, '0')} / 06`
  find('metric-caption').textContent = moment.caption
  find('metric-unit').textContent = moment.unit
  find('metric-icon').setAttribute('href', `#icon-${moment.icon}`)
  find('depth-label').textContent = index === 1 ? 'Top 10% of page' : '90% page depth'
  tabs.forEach((tab, tabIndex) => {
    tab.setAttribute('aria-selected', String(tabIndex === index))
    tab.tabIndex = tabIndex === index ? 0 : -1
  })
  if (focusTab) tabs[index].focus({ preventScroll: true })
  find('announcement').textContent = `${tabs[index].textContent.trim()}. ${moment.description}`
  render()
}

/**
 * Advance only by visible, unpaused animation time.
 * @param {number} timestamp Animation frame time in milliseconds.
 */
function tick (timestamp) {
  if (lastTime !== null) elapsed += Math.max(0, timestamp - lastTime)
  lastTime = timestamp
  if (elapsed >= TIMING.duration) selectMoment(nextMoment(momentIndex))
  render()
  animationId = window.requestAnimationFrame(tick)
}

/**
 * Keep a single animation loop and suspend it when the document is hidden.
 */
function syncPlayback () {
  window.cancelAnimationFrame(animationId)
  lastTime = null
  const active = playing && !document.hidden
  document.body.classList.toggle('is-paused', !active)
  find('playback-label').textContent = playing ? 'Autoplay on' : 'Autoplay paused'
  find('playback').setAttribute('aria-label', playing ? 'Pause walkthrough' : 'Play walkthrough')
  find('playback-icon').setAttribute('href', playing ? '#icon-pause' : '#icon-play')
  if (active) animationId = window.requestAnimationFrame(tick)
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectMoment(index))
  tab.addEventListener('keydown', event => {
    const targets = { ArrowRight: nextMoment(index), ArrowLeft: nextMoment(index, -1), Home: 0, End: MOMENTS.length - 1 }
    if (Object.hasOwn(targets, event.key)) {
      event.preventDefault()
      selectMoment(targets[event.key], true)
    }
  })
})
find('playback').addEventListener('click', () => {
  playing = !playing
  syncPlayback()
})
find('next-moment').addEventListener('click', () => selectMoment(nextMoment(momentIndex)))
/**
 * Return to the publisher page after an eligible close action.
 */
function closeAd () {
  if (frameAt(momentIndex, elapsed).phase !== 'ad' || closeButton.disabled) return
  elapsed = TIMING.resumeStart
  render()
}
closeButton.addEventListener('click', closeAd)
panel.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeAd()
})
document.addEventListener('visibilitychange', syncPlayback)
reducedMotion.addEventListener('change', () => {
  playing = !reducedMotion.matches
  selectMoment(momentIndex)
  syncPlayback()
})
new window.ResizeObserver(measureArticle).observe(document.querySelector('.browser-viewport'))
document.fonts.ready.then(measureArticle)
selectMoment(0)
measureArticle()
syncPlayback()
