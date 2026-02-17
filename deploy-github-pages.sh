#!/bin/bash

# GitHub Pages Deployment Script
# Deploys the Exit Ads demo to GitHub Pages

set -e

PREBID_BUNDLE="build/dev/prebid.js"
SOURCE_DEMO_DIR="exitAdsDemo"
DOCS_DIR="docs"
DEFAULT_BRANCH="master"

echo "🚀 Deploying Exit Ads Demo to GitHub Pages..."

# Check if source demo folder exists
if [ ! -d "$SOURCE_DEMO_DIR" ]; then
    echo "❌ Error: Source demo directory not found at $SOURCE_DEMO_DIR"
    exit 1
fi

# Check if prebid bundle exists
if [ ! -f "$PREBID_BUNDLE" ]; then
    echo "⚠️  Prebid bundle not found, building now..."
    npx gulp build-bundle-dev --modules=exitAdsModule,gumgumBidAdapter --nolint

    if [ ! -f "$PREBID_BUNDLE" ]; then
        echo "❌ Error: Build failed, bundle still not found"
        exit 1
    fi
fi

# Sync demo content into docs/ (GitHub Pages source)
echo "📁 Syncing $SOURCE_DEMO_DIR to $DOCS_DIR..."
mkdir -p "$DOCS_DIR"
rsync -a --delete "$SOURCE_DEMO_DIR"/ "$DOCS_DIR"/

# Copy latest prebid.js to docs folder
echo "📤 Copying latest prebid.js to $DOCS_DIR..."
cp "$PREBID_BUNDLE" "$DOCS_DIR/prebid.js"

# Commit and push
echo "📝 Committing changes..."
git add "$DOCS_DIR/"
git commit -m "Update GitHub Pages demo" || echo "No changes to commit"
git push origin "$DEFAULT_BRANCH"

echo "✅ Deployment complete!"
echo ""
echo "🌐 Demo URL: https://gumgum.github.io/exit-ads/"
echo ""
echo "💡 Note: GitHub Pages may take 1-2 minutes to update"
