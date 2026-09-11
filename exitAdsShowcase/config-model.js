export const TRIGGERS = [
  { key: 'bottomOfPage', label: 'Page end', field: 'threshold', defaultValue: 90, max: 100, unit: '%', description: 'When a reader reaches your chosen page depth.', inputLabel: 'Page depth' },
  { key: 'returnToTop', label: 'Back to top', field: 'threshold', defaultValue: 10, max: 100, unit: '%', description: 'After exploring, when a reader scrolls back to the top.', inputLabel: 'Top of page' },
  { key: 'idleTime', label: 'Time on page', field: 'minTime', defaultValue: 60, unit: 'sec', description: 'After time spent on the page, including active reading.', inputLabel: 'Time on page' },
  { key: 'tabFocusReturn', label: 'Tab return', field: 'minTime', defaultValue: 1, unit: 'sec', description: 'When a reader returns after visiting another tab.', inputLabel: 'Minimum time away' },
  { key: 'appFocusReturn', label: 'App return', field: 'minTime', defaultValue: 1, unit: 'sec', description: 'When a reader refocuses the browser after another window.', inputLabel: 'Minimum time away' }
]

export const DEFAULT_VALUES = {
  zone: '',
  slot: '',
  size: '300x250',
  closeDelay: '3',
  repeat: '60000',
  perPage: '5',
  perSession: '5',
  perDay: '10',
  custom: false,
  customEvent: 'video-complete',
  ...Object.fromEntries(TRIGGERS.flatMap(trigger => [[trigger.key, true], [`${trigger.key}Value`, String(trigger.defaultValue)]]))
}

const integer = (value, label, max = Number.MAX_SAFE_INTEGER) => {
  if (String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > max) {
    throw new Error(`${label}: ${max === 100 ? 'enter a whole number between 0 and 100' : 'enter a valid non-negative whole number'}.`)
  }
  return Number(value)
}

// Values stay as data until serialization. A custom event name cannot inject code.
export const buildConfiguration = values => {
  const repeatInterval = values.repeat === 'null' ? null : integer(values.repeat, 'Repeat interval')
  const trigger = Object.fromEntries(TRIGGERS.map(item => {
    if (!values[item.key]) return [item.key, { enabled: false }]
    const value = integer(values[`${item.key}Value`], item.inputLabel, item.max ?? Math.floor(Number.MAX_SAFE_INTEGER / 1000))
    return [item.key, { enabled: true, [item.field]: item.field === 'minTime' ? value * 1000 : value, repeatInterval }]
  }))
  const size = { '300x250': [300, 250], '300x600': [300, 600], '728x90': [728, 90] }[values.size]
  if (!size) throw new Error('Choose one of the available ad sizes.')
  if (values.custom && !values.customEvent.trim()) throw new Error('Enter an event name for your custom moment.')
  if (values.custom) trigger.custom = { enabled: true, repeatInterval }
  const config = {
    exitAds: {
      adUnit: {
        code: 'exit-ad-slot',
        mediaTypes: { banner: { sizes: [size] } },
        bids: [{ bidder: 'gumgum', params: { zone: values.zone.trim() || 'YOUR_ZONE_ID', slot: values.slot.trim() || 'YOUR_SLOT_ID' } }]
      },
      display: {
        closeButton: { enabled: true, delay: integer(values.closeDelay, 'Close delay', Math.floor(Number.MAX_SAFE_INTEGER / 1000)) * 1000 },
        frequency: {
          maxTriggersPerPage: integer(values.perPage, 'Page cap'),
          maxTriggersPerSession: integer(values.perSession, 'Session cap'),
          maxTriggersPerDay: integer(values.perDay, 'Daily cap')
        },
        trigger
      }
    }
  }
  let serialized = JSON.stringify(config, null, 2)
  if (values.custom) {
    const event = JSON.stringify(values.customEvent.trim())
    // Insert the function into the custom object, leaving all user strings JSON escaped.
    const customJson = JSON.stringify(trigger.custom, null, 2).replace(/\n/g, '\n        ')
    const withSetup = customJson.slice(0, customJson.lastIndexOf('\n')) + `,\n          "setup": function ({ trigger }) {\n            window.addEventListener(${event}, trigger);\n            return function cleanup() {\n              window.removeEventListener(${event}, trigger);\n            };\n          }\n        }`
    serialized = serialized.replace(`"custom": ${customJson}`, `"custom": ${withSetup}`)
  }
  const source = `// Add your GumGum placement IDs before publishing.\n// Load after Prebid.js and exit-ads.min.js.\nwindow.pbjs = window.pbjs || { que: [] };\nwindow.pbjs.que = window.pbjs.que || [];\nwindow.pbjs.que.push(function () {\n  window.pbjs.setConfig(${serialized.replace(/\n/g, '\n  ')});\n});\n`
  return { config, source, enabledCount: TRIGGERS.filter(item => values[item.key]).length + Number(values.custom) }
}
