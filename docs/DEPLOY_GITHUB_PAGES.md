# Deploy Exit Ads Demo to GitHub Pages

This repository publishes the demo site from the `docs/` folder on the `master` branch.

The source demo files live in `exitAdsDemo/`. The deployment script syncs `exitAdsDemo/` into `docs/`, updates `docs/prebid.js`, commits, and pushes.

## One-time setup (GitHub)

In repository settings:

- Go to **Settings > Pages**
- Set **Source** to **Deploy from a branch**
- Select branch **master**
- Select folder **/docs**

## Deploy

From repo root:

```bash
./deploy-github-pages.sh
```

If `build/dev/prebid.js` is missing, the script builds it automatically with:

```bash
npx gulp build-bundle-dev --modules=exitAdsModule,gumgumBidAdapter --nolint
```

After push, the site should be available at:

`https://gumgum.github.io/exit-ads/`

