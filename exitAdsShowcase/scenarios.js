export const MOMENTS = [
  {
    id: 'bottom',
    category: 'THE FINAL SCROLL',
    title: 'The story ends.\nYour moment begins.',
    description: 'As a reader reaches the end of an article, an Exit Ad brings your brand into view.',
    setting: 'Example trigger: 90% page depth',
    caption: 'of the page explored',
    unit: '%',
    icon: 'down',
    action: 'Reading the article',
    detected: '90% page depth reached'
  },
  {
    id: 'top',
    category: 'THE RETURN JOURNEY',
    title: 'Back to the top.\nA fresh opportunity.',
    description: 'After exploring the page, a reader scrolls back up. A return to the top becomes a new brand moment.',
    setting: 'Example trigger: return to the top 10%',
    caption: 'current page depth',
    unit: '%',
    icon: 'up',
    action: 'Exploring, then scrolling back up',
    detected: 'Reader returns to the top 10%'
  },
  {
    id: 'time',
    category: 'A LITTLE TIME TOGETHER',
    title: 'A little time.\nA lasting impression.',
    description: 'Give readers time with the content. Then introduce your brand after a duration you choose.',
    setting: 'Example trigger: 45 seconds on page',
    caption: 'spent on the page',
    unit: 's',
    icon: 'clock',
    action: 'Time on page is building',
    detected: '45 seconds on the page'
  },
  {
    id: 'tab',
    category: 'THE WELCOME BACK',
    title: 'Another tab.\nAnother moment.',
    description: 'A reader visits another tab, then comes back. The ad appears on their return, when the page is visible again.',
    setting: 'Example trigger: return after 1+ second',
    caption: 'the moment that matters',
    unit: '',
    icon: 'tabs',
    action: 'Reader switches to another tab',
    detected: 'Reader returns to this tab'
  },
  {
    id: 'app',
    category: 'BACK IN THE PICTURE',
    title: 'Life happens.\nBe there on return.',
    description: 'A reader moves to another app or window. When they refocus the browser, your brand comes into view.',
    setting: 'Example trigger: refocus after 1+ second',
    caption: 'the moment that matters',
    unit: '',
    icon: 'app',
    action: 'Reader moves to another window',
    detected: 'The browser has focus again'
  },
  {
    id: 'custom',
    category: 'A MOMENT OF YOUR OWN',
    title: 'Your experience.\nYour perfect cue.',
    description: 'A video ends. A milestone is reached. Bring your own event or trigger an ad directly at the moment you choose.',
    setting: 'Example trigger: a video finishes',
    caption: 'of the video watched',
    unit: '%',
    icon: 'custom',
    action: 'Watching an embedded video',
    detected: 'Video complete · custom event'
  }
]

export const TIMING = { actionEnd: 5400, adStart: 6900, closeDelay: 3000, resumeStart: 12900, duration: 14600 }

const clamp = value => Math.min(1, Math.max(0, value))
const smooth = value => { const p = clamp(value); return p * p * (3 - 2 * p) }

/**
 * Calculate one frame of the explanation, browser, and creative timeline.
 * @param {number} momentIndex Index of the selected moment.
 * @param {number} elapsed Elapsed playback time in milliseconds.
 * @returns {object} The synchronized scene state.
 */
export function frameAt (momentIndex, elapsed) {
  const moment = MOMENTS[momentIndex]
  const progress = clamp(elapsed / TIMING.duration)
  const action = smooth((elapsed - 650) / (TIMING.actionEnd - 650))
  const phase = elapsed < TIMING.actionEnd ? 'action' : elapsed < TIMING.adStart ? 'detected' : elapsed < TIMING.resumeStart ? 'ad' : 'resume'
  const away = (moment.id === 'tab' || moment.id === 'app') && elapsed >= 1450 && elapsed < 4400
  let depth = 0
  let metric = Math.round(action * 90)
  if (moment.id === 'bottom') depth = action * 0.9
  if (moment.id === 'top') {
    depth = elapsed < 2600 ? smooth((elapsed - 650) / 1950) * 0.72 : 0.72 - smooth((elapsed - 2600) / 2800) * 0.62
    metric = Math.round(depth * 100)
  }
  if (moment.id === 'time') metric = Math.round(action * 45)
  if (moment.id === 'custom') metric = Math.round(action * 100)
  if (moment.id === 'tab' || moment.id === 'app') metric = elapsed < 1450 ? 'Here' : away ? 'Away' : 'Back'
  const closeRemaining = Math.max(0, Math.ceil((TIMING.adStart + TIMING.closeDelay - elapsed) / 1000))
  const event = phase === 'ad' ? 'Your brand takes the spotlight' : phase === 'resume' ? 'Ad closed. Back to the experience.' : phase === 'detected' ? moment.detected : (moment.id === 'tab' || moment.id === 'app') && elapsed >= 4400 ? 'Welcome back to the page' : moment.action
  return { progress, action, phase, away, depth, metric, closeRemaining, event }
}

/**
 * Wrap moment navigation in either direction.
 * @param {number} index Current moment index.
 * @param {number} offset Direction to navigate.
 * @returns {number} The next moment index.
 */
export function nextMoment (index, offset = 1) {
  return (index + offset + MOMENTS.length) % MOMENTS.length
}
