# Exit Ads Module - Publisher Integration Guide

Exit Ads is a Prebid.js module that displays an ad overlay when users reach configured display opportunities such as bottom-of-page, return-to-top, idle time, tab return, app/window focus return, or publisher-defined custom events. It runs an isolated auction for the exit ad unit and renders the winning bid directly in an overlay.

- Works with **any** Prebid.js bidder adapter included in your build
- Does **not** require a dedicated GAM/ad server slot
- Does **not** interfere with existing page ad units or auctions

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Page Configuration](#page-configuration)
  - [Minimal example](#minimal-example)
  - [Full example](#full-example)
- [Configuration Reference](#configuration-reference)
  - [`adUnit`](#adunit-required)
  - [`display`](#display-optional)
  - [`display.frequency`](#displayfrequency)
  - [`display.trigger`](#displaytrigger)
    - [`display.trigger.bottomOfPage`](#displaytriggerbottomofpage)
    - [`display.trigger.returnToTop`](#displaytriggerreturntotop)
    - [`display.trigger.idleTime`](#displaytriggeridletime)
    - [`display.trigger.tabFocusReturn`](#displaytriggertabfocusreturn)
    - [`display.trigger.appFocusReturn`](#displaytriggerappfocusreturn)
    - [`display.trigger.custom`](#displaytriggercustom)
  - [`display.cssOverrides`](#displaycssoverrides)
  - [Callbacks](#callbacks)
  - [Manual trigger API](#manual-trigger-api)
- [How It Works](#how-it-works)
- [Testing Your Integration](#testing-your-integration)
- [FAQ](#faq)

## Prerequisites

- Node.js >= 20
- An existing Prebid.js build process, or willingness to build Prebid from this repository
- Your bidder adapter credentials
- `localStorage` and `sessionStorage` available for session/day frequency caps

## Installation

### If you already have Prebid.js

Rebuild Prebid with your existing adapters and append `exitAdsModule`:

```bash
gulp build --modules=gumgumBidAdapter,appnexusBidAdapter,rubiconBidAdapter,consentManagement,...,exitAdsModule
```

The output file is `build/dist/prebid.js`. Replace your current bundle with that file, then add the `exitAds` config below.

### If you do not have Prebid.js yet

```bash
git clone https://github.com/gumgum/exit-ads.git
cd exit-ads
npm install
gulp build --modules=exitAdsModule,gumgumBidAdapter
```

Include `build/dist/prebid.js` on your page and configure `exitAds`.

## Page Configuration

### Minimal example

If `display`, `display.trigger`, or `display.frequency` is omitted, the module uses the defaults documented below.

```javascript
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  pbjs.setConfig({
    exitAds: {
      adUnit: {
        code: 'exit-ad-slot',
        mediaTypes: {
          banner: {
            sizes: [[300, 250]]
          }
        },
        bids: [
          {
            bidder: 'gumgum',
            params: {
              zone: 'YOUR_ZONE_ID',
              slot: 'YOUR_SLOT_ID'
            }
          }
        ]
      }
    }
  });
});
```

### Full example

```javascript
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  pbjs.setConfig({
    exitAds: {
      adUnit: {
        code: 'exit-ad-slot',
        mediaTypes: {
          banner: {
            sizes: [[300, 250], [728, 90]]
          }
        },
        bids: [
          {
            bidder: 'gumgum',
            params: { zone: 'YOUR_ZONE', slot: 'YOUR_SLOT', bidfloor: 0.03 }
          }
        ]
      },

      display: {
        closeButton: {
          enabled: true,
          delay: 3000
        },
        frequency: {
          maxTriggersPerPage: 5,
          maxTriggersPerSession: 5,
          maxTriggersPerDay: 10
        },
        trigger: {
          bottomOfPage: {
            enabled: true,
            threshold: 90,
            repeatInterval: 60000
          },
          returnToTop: {
            enabled: true,
            threshold: 10,
            repeatInterval: 60000
          },
          idleTime: {
            enabled: true,
            minTime: 60000,
            repeatInterval: 60000
          },
          tabFocusReturn: {
            enabled: true,
            minTime: 1000,
            repeatInterval: 60000
          },
          appFocusReturn: {
            enabled: true,
            minTime: 1000,
            repeatInterval: 60000
          },
          custom: {
            enabled: true,
            repeatInterval: 60000,
            setup: function ({ trigger }) {
              window.addEventListener('article-complete', trigger);

              return function cleanup() {
                window.removeEventListener('article-complete', trigger);
              };
            }
          }
        },
        cssOverrides: `
          .exit-ads-overlay {
          }

          .exit-ads-container {
          }

          .exit-ads-close-button {
          }

          .exit-ads-close-button:hover {
          }

          .exit-ads-close-button--disabled {
          }

          .exit-ads-close-button--countdown {
          }
        `
      },

      onBidCached: function (bidInfo) {
        console.log('Bid cached:', bidInfo.bidder, bidInfo.cpm, bidInfo.size);
      },
      onTrigger: function (context) {
        console.log('Exit Ad trigger activated:', context.trigger);
      },
      onAdRender: function (context) {
        console.log('Exit Ad rendered:', context.trigger);
      },
      onAdClose: function (context) {
        console.log('Exit Ad closed:', context.trigger);
      },
      onFrequencyCapReached: function (context) {
        console.log('Frequency cap reached:', context.trigger);
      },
      onTriggerSuppressed: function (context) {
        console.log('Exit Ad suppressed:', context.trigger, context.reason);
      }
    }
  });
});
```

## Configuration Reference

### `adUnit` (required)

Standard Prebid.js ad unit. The `bids` array determines which bidders compete.

| Field | Description |
|---|---|
| `code` | Unique identifier for the exit ad unit |
| `mediaTypes.banner.sizes` | Eligible banner sizes, e.g. `[[300, 250], [728, 90]]` |
| `bids` | Bidder configs in normal Prebid ad unit format |

### `display` (optional)

`display` controls overlay presentation, trigger policy, frequency caps, and CSS overrides. If omitted, all defaults apply.

| Field | Type | Default | Description |
|---|---|---|---|
| `closeButton.enabled` | Boolean | `true` | Whether to show the close button |
| `closeButton.delay` | Number (ms) | `3000` | Time the close button stays disabled after render. While disabled it displays a whole-second countdown rounded up from milliseconds, e.g. `5000` displays `5`, `32543` displays `33`. Values above 99 seconds display `99+` until the countdown drops below 100. |
| `cssOverrides` | String | `''` | CSS appended after the module base stylesheet. Use it to override the stable `.exit-ads-*` classes without editing module code. |

### `display.frequency`

Frequency caps apply globally across all successful exit-ad displays, including manual displays. No-bid attempts and suppressed trigger events do not consume caps. The counters below are independent of trigger type.

| Field | Type | Default | Description |
|---|---|---|---|
| `maxTriggersPerPage` | Number | `5` | Maximum successful overlay renders for the current page load. This counter is in memory and resets when the page is reloaded or navigated away from and loaded again. |
| `maxTriggersPerSession` | Number | `5` | Maximum successful overlay renders for the current browser tab session. This counter is stored in `sessionStorage` and resets when that tab/session storage is cleared, usually when the tab is closed. |
| `maxTriggersPerDay` | Number | `10` | Maximum successful overlay renders for the current local day in the user's browser timezone. This counter is stored in `localStorage` with a date value and resets automatically when the stored date no longer matches `new Date().toDateString()`. |

### `display.trigger`

Multiple enabled triggers are OR conditions. The first eligible trigger begins the auction/display flow. No trigger can render within 30 seconds of a previous successful render or manual close. This 30-second gate is in memory and resets on page reload.

Closing an exit ad restarts the same 30-second global render interval, so a user who dismisses the overlay is not immediately presented with another one.

`repeatInterval` is measured from a successful render for that specific trigger. Suppressed attempts and no-bid attempts do not reset it. `repeatInterval: null` is tracked in memory and resets on page reload.

#### `display.trigger.bottomOfPage`

Triggers when the user scrolls down to a configured page-depth percentage.

| Field | Default | Description |
|---|---|---|
| `bottomOfPage.enabled` | `true` | Enable bottom-of-page trigger |
| `bottomOfPage.threshold` | `90` | Trigger when scroll depth reaches this percentage |
| `bottomOfPage.prefetchAtThreshold` | unset | Optional scroll percentage that starts the auction before the trigger threshold is reached |
| `bottomOfPage.repeatInterval` | `60000` | Minimum ms after this trigger successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |

#### `display.trigger.returnToTop`

Triggers when the user scrolls deeper than the configured threshold, then returns upward to that threshold.

| Field | Default | Description |
|---|---|---|
| `returnToTop.enabled` | `true` | Enable return-to-top trigger |
| `returnToTop.threshold` | `10` | Trigger after the user has scrolled deeper than this percentage and then returns to it |
| `returnToTop.prefetchAtThreshold` | unset | Optional scroll percentage that starts the auction while the user is scrolling upward toward the top threshold. The user must first scroll deeper than this value, then cross back upward through it. Set this higher than `returnToTop.threshold`; values at or below the trigger threshold do not create a useful prefetch window. |
| `returnToTop.repeatInterval` | `60000` | Minimum ms after this trigger successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |

#### `display.trigger.idleTime`

Triggers after the user has remained on the page for the configured time.

| Field | Default | Description |
|---|---|---|
| `idleTime.enabled` | `true` | Enable page-time trigger |
| `idleTime.minTime` | `60000` | Trigger after this many ms on the page |
| `idleTime.prefetchAtTime` | unset | Optional time on page in ms that starts the auction before `minTime`. Values greater than or equal to `idleTime.minTime` are ignored. |
| `idleTime.repeatInterval` | `60000` | Minimum ms after this trigger successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |

#### `display.trigger.tabFocusReturn`

Triggers when the document changes from hidden back to visible after the configured minimum hidden time.

| Field | Default | Description |
|---|---|---|
| `tabFocusReturn.enabled` | `true` | Enable hidden-to-visible tab return trigger |
| `tabFocusReturn.minTime` | `1000` | Minimum time in ms that the document must be hidden before returning to visible can trigger |
| `tabFocusReturn.repeatInterval` | `60000` | Minimum ms after this trigger successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |

#### `display.trigger.appFocusReturn`

Triggers when the browser window blurs and focuses again while the document remains visible.

| Field | Default | Description |
|---|---|---|
| `appFocusReturn.enabled` | `true` | Enable visible-page window blur/focus return trigger |
| `appFocusReturn.minTime` | `1000` | Minimum time in ms that the window must be blurred while the document remains visible before focus return can trigger |
| `appFocusReturn.repeatInterval` | `60000` | Minimum ms after this trigger successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |

#### `display.trigger.custom`

Lets publishers own their own event and timing logic. `custom` is inactive by default and only runs when supplied.

| Field | Default | Description |
|---|---|---|
| `custom.enabled` | unset | Enable the custom trigger. No custom trigger is registered unless `custom` is supplied. |
| `custom.repeatInterval` | `60000` | Minimum ms after custom successfully renders before it can render again; `0` means only the global 30s gate applies, `null` means once per page load |
| `custom.setup` | unset | Function called with `{ trigger }`; call `trigger()` when publisher logic says the ad should run. May return a cleanup function. |

The primary custom trigger API:

```javascript
custom: {
  enabled: true,
  repeatInterval: 60000,
  setup: function ({ trigger }) {
    window.addEventListener('article-complete', trigger);

    return function cleanup() {
      window.removeEventListener('article-complete', trigger);
    };
  }
}
```

For simple cases, `custom` can also be a boolean condition function. It is polled once per second:

```javascript
custom: function () {
  return window.articleComplete === true;
}
```

### `display.cssOverrides`

The module injects base CSS first, then `display.cssOverrides` second. Use these stable selectors:

```css
.exit-ads-overlay {
}

.exit-ads-container {
}

.exit-ads-close-button {
}

.exit-ads-close-button:hover {
}

.exit-ads-close-button--disabled {
}

.exit-ads-close-button--countdown {
}
```

### Callbacks

| Callback | When it fires |
|---|---|
| `onBidCached(bidInfo)` | A bid has been received and cached for the exit ad unit |
| `onTrigger({ trigger })` | A trigger/manual call passed gating and the module is starting or waiting for an auction |
| `onAdRender({ trigger })` | The overlay was successfully rendered; frequency counters and repeat timing are updated after this |
| `onAdClose({ trigger })` | The user closed the overlay; the hard 30-second global render gate restarts |
| `onFrequencyCapReached({ trigger })` | A trigger or manual call was suppressed by frequency caps |
| `onTriggerSuppressed({ trigger, reason, message })` | A trigger/manual call was evaluated but did not render, for example because of the global gate, repeat interval, frequency cap, no bid, or no cached bid |

### Manual trigger API

```javascript
pbjs.exitAds.trigger();
```

Manual triggers respect the 30-second global render interval and `display.frequency`, and successful manual renders consume frequency caps.

## How It Works

1. Module initializes when `pbjs.setConfig({ exitAds: {...} })` is called.
2. `display` is merged with defaults.
3. Trigger monitors are registered.
4. Optional per-trigger prefetch points can start an auction before display eligibility.
5. When a trigger passes repeat, global interval, and frequency gates:
   - `onTrigger` fires
   - an auction starts if no bid is cached
   - the winning bid renders in the overlay
   - page/session/day counters update after successful render

## Testing Your Integration

1. Open your browser's developer console.
2. Look for log messages starting with `exitAds:`.
3. Trigger the ad by scrolling, waiting for idle time, switching tabs/apps and returning, or calling `pbjs.exitAds.trigger()`.
4. Verify:
   - A bid was requested and cached.
   - The overlay appears with the winning creative.
   - The close button shows a countdown while disabled, then can close the overlay.
   - Frequency caps count successful displays only.

**To reset frequency caps during testing:**

```javascript
sessionStorage.removeItem('exitAds_frequency_session_count');
localStorage.removeItem('exitAds_frequency_daily_count');
```

## FAQ

**Will this break my existing ads?**
No. The Exit Ads module runs its own auction for a separate ad unit. Existing page ad units and auctions are unaffected.

**Do I need a GAM slot for the exit ad?**
No. The module renders the winning creative directly into a DOM overlay.

**Can I use bidders other than GumGum?**
Yes. Exit Ads works with any Prebid.js bidder adapter included in your build.

**What happens if no bid is returned?**
No ad is shown. The module waits up to 5 seconds after trigger activation for a bid.

**How are tab and app return different?**
`tabFocusReturn` uses document hidden-to-visible changes. `appFocusReturn` uses window blur-to-focus only while the page stays visible, so the same tab switch does not fire both triggers.
