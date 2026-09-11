# GumGum Exit Ads showcase

A standalone, responsive product walkthrough with publisher integration and configuration guides. All six moments play inside a simulated publisher browser; visitors do not need to scroll, leave the tab, or wait 45 seconds themselves.

From the repository root:

```sh
npm run exit-ads:showcase
```

Open **http://localhost:8081**. No build step or additional dependencies are needed. The pages, fonts, and images are served locally, with no live ad requests or tracking. Header navigation connects the experience, integration guide, configuration builder, and existing developer test tool. The existing `docs/` GitHub Pages demo and `exitAdsDemo/` integration demo are independent and unchanged.

## Behavior

- Page end, return to top, time on page, tab return, app/window return, and a custom video-complete event.
- Automatic progression, pause/resume, moment selection, and next-moment controls.
- Keyboard tab navigation supports arrow keys, Home, and End. Escape closes an eligible example ad.
- The overlay illustrates a three-second close delay and then returns to the publisher page.
- Reduced-motion preferences start with a still example and an enabled close button. Autoplay can be explicitly enabled.
- Real tab visibility changes pause the walkthrough without changing its selected moment or playback preference.

The presentation illustrates successful display opportunities. It does not simulate auctions, no-bid outcomes, frequency counters, or the module’s 30-second minimum between successful displays. The 45-second page-time value is an example, not the module’s 60-second default. Tab/app scenes show the ad **after returning**. Source behavior was checked against `modules/exitAdsModule/index.js` and `exitAdsDemo/README.md`; the older `modules/exitAdsModule.md` describes an earlier API.

## Publisher guides

- `integration.html` walks through the ready-to-use publisher package, required GumGum adapter, script loading order, placement configuration, and verification.
- `configuration.html` generates JavaScript for enabled moments, thresholds, timing, frequency caps, a custom event listener with cleanup, and placement IDs. Copy and download use the same validated output. Placement details stay in the browser and are not persisted.
- Expandable references cover defaults, prefetching, event and polling triggers, frequency, banner sizes, styling, auctions, storage, callbacks, and lifecycle APIs.
- The client installation instructions follow the current published companion package, verified against [installation](https://gumgum-inc.github.io/exit-ads-module/installation.html) and [configuration](https://gumgum-inc.github.io/exit-ads-module/configuration.html). This differs from the older integrated-module source in this checkout. The package download and developer tool links use that existing published site.

## Creative and assets

The Doritos / Stranger Things overlay is an illustrative animation composed from the same GumGum Studio `mexaroma/3` artwork used by the integration demo. It does not load the production creative runtime. Asset origins are recorded in `assets/sources.json`. GumGum’s official logo and Circular typeface are included locally, along with an editorial landscape photograph from Unsplash.

## Verification

```sh
npx eslint exitAdsShowcase/*.js exitAdsShowcase/tests/*.js --cache --cache-strategy content
npm --prefix exitAdsShowcase test
```

The focused Node tests verify scene ordering, thresholds, return timing, countdown gating, playback controls, visibility suspension, keyboard navigation, reduced motion, and responsive scroll measurements. Guide tests execute generated configurations, check custom event cleanup, validation, actual form defaults, navigation, clipboard fallback, and download content. They use the repository’s existing `node-html-parser` dependency for the page fixture and do not compile or run the Prebid test suite.

To host separately, publish this directory’s HTML, CSS, JavaScript, and `assets/` together (excluding tests and development files) on any static host. Nothing has been deployed by adding this directory.
