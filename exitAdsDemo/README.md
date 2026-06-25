# Exit Ads Module - Publisher Integration Guide

Exit Ads is a Prebid.js module that displays an ad overlay when users reach configured display opportunities such as bottom-of-page, return-to-top, idle time, tab return, app/window focus return, or publisher-defined custom events. It runs an isolated auction for the exit ad unit and renders the winning bid directly in an overlay.

- Works with **any** Prebid.js bidder adapter included in your build
- Does **not** require a dedicated GAM/ad server slot
- Does **not** interfere with existing page ad units or auctions

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
        type: 'overlay',
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
            prefetchAtThreshold: 70,
            repeatInterval: 60000
          },
          returnToTop: {
            enabled: true,
            threshold: 10,
            prefetchAtThreshold: 50,
            repeatInterval: 60000
          },
          idleTime: {
            enabled: true,
            minTime: 60000,
            prefetchAtTime: 30000,
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
| `type` | `'overlay'` or `'interstitial'` | `'overlay'` | Display format. `interstitial` currently uses the overlay renderer. |
| `closeButton.enabled` | Boolean | `true` | Whether to show the close button |
| `closeButton.delay` | Number (ms) | `3000` | Delay before close button is enabled |
| `cssOverrides` | String | `''` | CSS stylesheet text injected after module base styles |

### `display.frequency`

Frequency caps apply globally across all successful exit-ad displays, including manual displays. No-bid attempts and suppressed trigger events do not consume caps.

| Field | Type | Default | Description |
|---|---|---|---|
| `maxTriggersPerPage` | Number | `5` | Maximum successful displays during the current page view |
| `maxTriggersPerSession` | Number | `5` | Maximum successful displays in the browser session |
| `maxTriggersPerDay` | Number | `10` | Maximum successful displays for the current calendar day |

### `display.trigger`

Multiple enabled triggers are OR conditions. The first eligible trigger begins the auction/display flow. No trigger can render within 30 seconds of a previous successful render.

Closing an exit ad also restarts the same 30-second global render interval, so a user who dismisses the overlay is not immediately presented with another one.

| Field | Default | Description |
|---|---|---|
| `bottomOfPage.enabled` | `true` | Enable bottom-of-page trigger |
| `bottomOfPage.threshold` | `90` | Fire when scroll depth reaches this percentage |
| `bottomOfPage.prefetchAtThreshold` | `70` | Optional scroll percentage to start the auction before display eligibility |
| `bottomOfPage.repeatInterval` | `60000` | Minimum ms before this trigger can render again; `null` means once per page view |
| `returnToTop.enabled` | `true` | Enable return-to-top trigger |
| `returnToTop.threshold` | `10` | Fire after user scrolls past this percentage and returns to it |
| `returnToTop.prefetchAtThreshold` | `50` | Optional scroll percentage to start the auction before return |
| `returnToTop.repeatInterval` | `60000` | Minimum ms before this trigger can render again; `null` means once per page view |
| `idleTime.enabled` | `true` | Enable page-time trigger |
| `idleTime.minTime` | `60000` | Fire after this many ms on the page |
| `idleTime.prefetchAtTime` | `30000` | Optional ms on page to start the auction before display eligibility |
| `idleTime.repeatInterval` | `60000` | Minimum ms before this trigger can render again; `null` means once per page view |
| `tabFocusReturn.enabled` | `true` | Enable hidden-to-visible tab return trigger |
| `tabFocusReturn.minTime` | `1000` | Minimum hidden duration before return can trigger |
| `tabFocusReturn.repeatInterval` | `60000` | Minimum ms before this trigger can render again; `null` means once per page view |
| `appFocusReturn.enabled` | `true` | Enable visible-page window blur/focus return trigger |
| `appFocusReturn.minTime` | `1000` | Minimum blurred duration before focus return can trigger |
| `appFocusReturn.repeatInterval` | `60000` | Minimum ms before this trigger can render again; `null` means once per page view |

`repeatInterval: 0` is valid. It allows the trigger to repeat as soon as other gates allow it, including the non-configurable 30-second global render interval.

### `custom` trigger

The primary custom trigger API lets publishers own their own event and timing logic:

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

### CSS selectors

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
| `onBidCached(bidInfo)` | A bid has been received and cached |
| `onTrigger({ trigger })` | A trigger passed gating and started the auction/display flow |
| `onAdRender({ trigger })` | The overlay was rendered |
| `onAdClose({ trigger })` | The user closed the overlay |
| `onFrequencyCapReached({ trigger })` | A trigger or manual call was suppressed by frequency caps |
| `onTriggerSuppressed({ trigger, reason, message })` | A trigger/manual call was eligible enough to be evaluated but did not render |

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
   - The close button works after the delay.
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
