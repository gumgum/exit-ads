# Exit Ads Demo and Integration Guide

This guide explains how to deliver the custom Prebid bundle to a partner, what they need to do on their side, and how Exit Ads works.

## What this custom bundle is

This repository builds a custom `prebid.js` that includes:

- `exitAdsModule`
- `gumgumBidAdapter`

Build command:

```bash
npm run exit-ads
```

Output bundle:

- `build/dev/prebid.js`

For demo publishing, this bundle is copied into:

- `exitAdsDemo/prebid.js` (local/demo use)
- `docs/prebid.js` (GitHub Pages deployment flow)

## How the partner gets the file

Use an explicit artifact handoff for production.

Recommended process:

1. Build the bundle (`build/dev/prebid.js`)
2. Optional: Rename/version it for traceability (example: `prebid-exitads-v2026-02-17.js`)
3. Copy the file for use

Important:

- GitHub Pages in this repo is for demo validation only.
- Do not use the GitHub Pages URL as the production integration source for partners.

## What the partner does on their end

At a high level, they:

1. Replace their current Prebid script include with your custom bundle
2. Add `pbjs.setConfig({ exitAds: { ... } })` configuration
3. Provide bidder params in `exitAds.adUnit.bids` (their own account credentials)
4. Choose trigger and frequency settings that match their UX policy

Important: swapping only the bundle without `exitAds` config will not activate Exit Ads.

## Anything required beyond swapping prebid.js?

Yes, they also need:

- **Exit Ads config** via `pbjs.setConfig({ exitAds: ... })`
- **A valid adUnit** under `exitAds.adUnit` (sizes + bidder params)
- **Trigger logic** (for example scroll depth, time-on-page, or manual trigger)
- **Storage availability** (`sessionStorage` / `localStorage`) for frequency capping

No dedicated GAM slot is required for the current overlay behavior; the module renders the winning bid creative directly into an overlay container.

## How Exit Ads works (runtime flow)

1. Module initializes when `exitAds` config is set
2. Trigger monitors are registered (`scroll`, `timeOnPage`, `exitIntent`, `custom`)
3. Optional prefetch:
   - `eager`: start auction immediately
   - `lazy`: start auction when `lazyTriggerPoint` is reached
4. On trigger:
   - frequency caps are checked
   - if no cached bid exists, module requests bids for `exitAds.adUnit`
   - winning bid is cached
   - ad is shown as overlay/interstitial
5. Module updates session/day frequency counters
6. Manual trigger API is available at `pbjs.exitAds.trigger()`

## Prebid-side configuration example

Use this as the minimum integration shape:

```javascript
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  pbjs.setConfig({
    exitAds: {
      adUnit: {
        code: 'exit-ad-gumgum',
            mediaTypes: {
              banner: {
                sizes: [[300, 250]]
              }
            },
            bids: [
              {
                bidder: 'gumgum',
                params: {
                  zone: 'dc9d6be1',    // GumGum test zone
                  slot: '15901',       // GumGum test slot
                  bidfloor: 0.03
                }
              }
            ]
      },
      // Trigger configuration
      trigger: {
        scroll: { depth: 90 },      // Trigger at 90% scroll
        timeOnPage: 45000           // OR after 45 seconds
      },

      // Pre-fetch strategy
      prefetch: {
        mode: 'lazy',
        lazyTriggerPoint: {
          scroll: { depth: 70 }     // Start auction at 70% scroll
        }
      },

      // Display configuration
      display: {
        type: 'overlay',
        closeButton: true,
        closeDelay: 3000,           // 3 second delay before close button
        frequency: {
          maxPerSession: 5,         // Allow multiple for testing
          maxPerDay: 10
        }
      },

      // Callbacks
      onBidCached: function(bidInfo) {
        logEvent('✓ Bid cached: ' + bidInfo.bidder + ' $' + bidInfo.cpm.toFixed(2) + ' CPM (' + bidInfo.size + ')');
      },
      onTrigger: function() {
        logEvent('✓ Trigger activated! Preparing to show Exit Ad...');
      },
      onAdRender: function() {
        logEvent('✓ Exit Ad rendered successfully');
      },
      onAdClose: function() {
        logEvent('✓ Exit Ad closed by user');
      },
      onFrequencyCapReached: function() {
        logEvent('⚠ Frequency cap reached - ad not shown');
      }
    }
  });
});
```

## Operational notes and gotchas

- The module triggers automatically only once per page lifecycle; manual trigger can be used multiple times (subject to caps).
- If no bid returns within the internal wait window, no ad is shown.
- Frequency capping keys are:
  - `exitAds_session_count`
  - `exitAds_daily_count`
  - `exitAds_last_shown`
- The demo contains test creative behavior in `gumgumBidAdapter` when `window.selectedTestCreative` is set. Do not rely on that for production behavior.
- Build includes only specified modules; if partner needs additional bidders/modules, include them in the build command.

## Suggested handoff checklist for Mediavine

- Confirm artifact delivery channel and file naming/versioning
- Confirm exact build command/modules used
- Confirm bidder credentials and sizes to enable
- Confirm trigger thresholds and frequency limits
- Validate in staging:
  - bid is requested
  - bid is cached
  - ad renders
  - close delay and close behavior are acceptable
  - caps are enforced

