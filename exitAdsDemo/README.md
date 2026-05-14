# Exit Ads Module — Publisher Integration Guide

Exit Ads is a Prebid.js module that displays an ad overlay when users reach configurable trigger points (scroll depth, time on page, exit intent, or custom logic). It runs its own isolated auction, renders the winning bid directly as an overlay, and includes built-in frequency capping.

- Works with **any** Prebid.js bidder adapter — not limited to GumGum
- Does **not** require a dedicated GAM/ad server slot — the module renders the creative directly
- Does **not** interfere with your existing ad units or auctions

## Prerequisites

- Node.js >= 20
- An existing Prebid.js build process (or willingness to set one up)
- Your bidder adapter credentials (zone IDs, placement IDs, etc.)
- `localStorage` and `sessionStorage` available in the browser (standard — required for frequency capping)

## Installation

### If you already have Prebid.js (most publishers)

Your site already loads a `prebid.js` file that was built with a set of adapters. To add Exit Ads, you rebuild Prebid from this repository with `exitAdsModule` added to your existing module list.

**1. Clone this repository**

```bash
git clone https://github.com/gumgum/exit-ads.git
cd exit-ads
npm install
```

**2. Build with your existing adapters + exitAdsModule**

List every adapter and module you currently use, and append `exitAdsModule`:

```bash
gulp build --modules=gumgumBidAdapter,appnexusBidAdapter,rubiconBidAdapter,consentManagement,...,exitAdsModule
```

> **Important:** If you omit an adapter you currently use, that bidder will stop working on your site. Make sure you include everything from your current build. If you're unsure which adapters you currently bundle, check your existing build command or contact your Prebid maintainer.

The output file is `build/dist/prebid.js`.

**3. Replace your current prebid.js with the new build**

Swap the file on your CDN or hosting. The new bundle is a drop-in replacement — it contains everything your old bundle had, plus the Exit Ads module.

**4. Add Exit Ads configuration to your page**

Add a `pbjs.setConfig` call with your Exit Ads configuration. This is the only page-level code change required. See [Page Configuration](#page-configuration) below.

### If you don't have Prebid.js yet

Clone this repository, install dependencies, and build with the adapters you need:

```bash
git clone https://github.com/gumgum/exit-ads.git
cd exit-ads
npm install
gulp build --modules=exitAdsModule,gumgumBidAdapter
```

Then include `build/dist/prebid.js` on your page and add the Exit Ads configuration.

## Page Configuration

Add this to your page where you configure Prebid. No other page changes are needed.

### Minimal example

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
      },
      trigger: {
        scroll: { depth: 90 }
      },
      display: {
        frequency: { maxPerSession: 1, maxPerDay: 3 }
      }
    }
  });
});
```

### Full example with all options

```javascript
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  pbjs.setConfig({
    exitAds: {
      // Ad unit — use any Prebid bidder(s) you have in your build
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
          },
          {
            bidder: 'appnexus',
            params: { placementId: '12345' }
          }
        ]
      },

      // When to show the ad (conditions are OR — first one met wins)
      trigger: {
        scroll: { depth: 90 },      // At 90% scroll depth
        timeOnPage: 60000,           // OR after 60 seconds
        exitIntent: true,            // OR when cursor leaves the viewport
        custom: function () {        // OR a custom condition
          return window.articleComplete === true;
        }
      },

      // When to start the auction (before the trigger fires)
      prefetch: {
        mode: 'lazy',                // 'eager' = immediately, 'lazy' = at a trigger point
        lazyTriggerPoint: {
          scroll: { depth: 70 }      // Start auction at 70% scroll
        }
      },

      // How the ad is displayed
      display: {
        type: 'overlay',             // 'overlay' or 'interstitial'
        closeButton: true,
        closeDelay: 3000,            // Milliseconds before close button is enabled
        frequency: {
          maxPerSession: 1,          // Per browser session (resets on tab close)
          maxPerDay: 3               // Per calendar day (resets at midnight)
        }
      },

      // Callbacks (all optional)
      onBidCached: function (bidInfo) {
        console.log('Bid cached:', bidInfo.bidder, bidInfo.cpm, bidInfo.size);
      },
      onTrigger: function () {
        console.log('Exit Ad trigger activated');
      },
      onAdRender: function () {
        console.log('Exit Ad rendered');
      },
      onAdClose: function () {
        console.log('Exit Ad closed');
      },
      onFrequencyCapReached: function () {
        console.log('Frequency cap reached — ad not shown');
      }
    }
  });
});
```

## Configuration Reference

### `adUnit` (required)

Standard Prebid.js ad unit. The `bids` array determines which bidders compete — you can use any adapter included in your build.

| Field | Description |
|---|---|
| `code` | Unique identifier for the exit ad unit |
| `mediaTypes.banner.sizes` | Array of eligible sizes, e.g. `[[300, 250], [728, 90]]` |
| `bids` | Array of bidder configs — same format as any Prebid ad unit |

### `trigger` (required)

When the ad should appear. Multiple types can be combined (OR logic — first condition met activates).

| Field | Type | Description |
|---|---|---|
| `scroll.depth` | Number (0–100) | Percentage of page scrolled |
| `timeOnPage` | Number (ms) | Milliseconds since page load |
| `exitIntent` | Boolean | Fires when cursor leaves the viewport (desktop) |
| `custom` | Function | Return `true` to trigger — polled every second |

### `prefetch` (optional)

Controls when the bid auction starts, independently of when the ad is shown.

| Field | Type | Default | Description |
|---|---|---|---|
| `mode` | `'eager'` or `'lazy'` | `'lazy'` | `eager`: auction starts on page load. `lazy`: auction starts when `lazyTriggerPoint` is met |
| `lazyTriggerPoint` | Object | — | Same shape as `trigger` — defines when the auction begins |

**When to use each mode:**
- **Eager** — high-engagement content where the exit ad is very likely to show. Minimizes latency.
- **Lazy** — general content where many users may leave before reaching the trigger. Reduces wasted bid requests.

### `display` (optional)

| Field | Type | Default | Description |
|---|---|---|---|
| `type` | `'overlay'` or `'interstitial'` | `'overlay'` | Display format |
| `closeButton` | Boolean | `true` | Show a close button |
| `closeDelay` | Number (ms) | `0` | Delay before the close button becomes active. Shows a countdown. |
| `frequency.maxPerSession` | Number | unlimited | Max impressions per browser session |
| `frequency.maxPerDay` | Number | unlimited | Max impressions per calendar day |

### Callbacks (optional)

| Callback | When it fires |
|---|---|
| `onBidCached(bidInfo)` | A bid has been received and cached. `bidInfo` contains `bidder`, `cpm`, `size`. |
| `onTrigger()` | A trigger condition was met |
| `onAdRender()` | The ad overlay was rendered on screen |
| `onAdClose()` | The user closed the ad |
| `onFrequencyCapReached()` | A trigger fired but the ad was suppressed by frequency caps |

### Manual trigger API

```javascript
pbjs.exitAds.trigger();
```

Manual triggers bypass the one-per-page limit on automatic triggers but still respect frequency caps.

## How It Works

1. Module initializes when `pbjs.setConfig({ exitAds: {...} })` is called
2. Trigger monitors are registered based on your `trigger` config
3. If `prefetch` is configured, the bid auction starts early (before the trigger fires)
4. When a trigger condition is met:
   - Frequency caps are checked
   - If no bid is cached yet, the module starts an auction and waits (up to 5 seconds)
   - The winning bid's creative is rendered in a full-screen overlay
5. Frequency counters are updated in `sessionStorage` / `localStorage`
6. Automatic triggers fire only once per page load; manual triggers can fire multiple times (subject to caps)

## Testing Your Integration

After deploying the new `prebid.js` and adding the config:

1. Open your browser's developer console
2. Look for log messages starting with `exitAds:` — you should see `Initialized v1.0.0`
3. Trigger the ad (scroll to your configured depth, wait for the timer, or use `pbjs.exitAds.trigger()` in the console)
4. Verify:
   - A bid was requested and cached
   - The overlay appears with the winning creative
   - The close button works (after the delay, if configured)
   - Frequency caps are enforced (refresh and trigger again — check that caps limit the impressions)

**To reset frequency caps during testing:**

```javascript
sessionStorage.removeItem('exitAds_session_count');
localStorage.removeItem('exitAds_daily_count');
localStorage.removeItem('exitAds_last_shown');
```

## Live Demo

A working demo is available at: https://gumgum.github.io/exit-ads/

This demo uses test GumGum credentials and a sample creative. It is not suitable for production use.

## FAQ

**Will this break my existing ads?**
No. The Exit Ads module runs its own isolated auction for a separate ad unit. Your existing ad units, bidders, and GAM integration are unaffected.

**Do I need to set up a GAM slot for the exit ad?**
No. The module renders the winning creative directly into a DOM overlay. No ad server slot is needed.

**What if I already have the GumGum adapter in my build?**
That's fine — just make sure it appears once in your `--modules` list. Prebid deduplicates automatically.

**Can I use bidders other than GumGum?**
Yes. Exit Ads works with any Prebid.js bidder adapter. Just include the adapter in your build and reference it in `adUnit.bids`.

**What sizes are supported?**
Any standard banner size. Configure them in `adUnit.mediaTypes.banner.sizes`. Common choices are `300x250`, `728x90`, `300x600`, and `320x50`.

**What happens if no bid is returned?**
No ad is shown. The module waits up to 5 seconds for a bid after triggering — if none arrives, it silently does nothing.

**Can I trigger the ad programmatically?**
Yes — call `pbjs.exitAds.trigger()` from your own code. This is useful for integrating with custom CMS or reader-progress events.

**How does frequency capping work?**
Session caps use `sessionStorage` (reset when the tab is closed). Daily caps use `localStorage` (reset at midnight). If storage is unavailable, the module allows the ad to show (no silent failure).
