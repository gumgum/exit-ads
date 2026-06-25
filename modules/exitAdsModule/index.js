/**
 * Exit Ads Module
 *
 * This module enables publisher-controlled ad units that appear when users
 * reach configured content-consumption or return triggers.
 *
 * @module modules/exitAdsModule
 */

import { config } from '../../src/config.js';
import { logInfo, logWarn, logError } from '../../src/utils.js';
import { getGlobal } from '../../src/prebidGlobal.js';
import * as events from '../../src/events.js';
import { EVENTS } from '../../src/constants.js';
import { getWinDimensions } from '../../src/utils/winDimensions.js';
import { getStorageManager } from '../../src/storageManager.js';

const MODULE_NAME = 'exitAds';
const VERSION = '1.0.0';
const GLOBAL_RENDER_INTERVAL = 30000;
const CUSTOM_POLL_INTERVAL = 1000;
const BASE_STYLE_ID = 'exit-ads-base-styles';
const OVERRIDE_STYLE_ID = 'exit-ads-override-styles';

const DEFAULT_FREQUENCY = {
  maxTriggersPerPage: 5,
  maxTriggersPerSession: 5,
  maxTriggersPerDay: 10
};

const DEFAULT_TRIGGER_CONFIG = {
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
  }
};

const DEFAULT_DISPLAY_CONFIG = {
  type: 'overlay',
  closeButton: {
    enabled: true,
    delay: 3000
  },
  frequency: DEFAULT_FREQUENCY,
  trigger: DEFAULT_TRIGGER_CONFIG,
  cssOverrides: ''
};

const BASE_CSS = `
.exit-ads-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 1;
  transition: opacity 0.2s ease-out;
}

.exit-ads-container {
  position: relative;
  background: #fff;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  min-width: var(--exit-ads-container-min-width, 300px);
  min-height: var(--exit-ads-container-min-height, 250px);
}

.exit-ads-close-button {
  position: absolute;
  top: -12px;
  right: -12px;
  background: #000;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  max-width: 28px;
  max-height: 28px;
  font-size: 20px;
  font-weight: normal;
  line-height: 28px;
  text-align: center;
  cursor: pointer;
  z-index: 2147483647;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.exit-ads-close-button:hover {
  background: #333;
}

.exit-ads-close-button--disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.exit-ads-close-button--countdown {
  font-size: 14px;
  font-weight: bold;
}
`;

// Storage manager
const storage = getStorageManager({ moduleType: 'core', moduleName: MODULE_NAME });

// Module state
let moduleConfig = null;
let displayConfig = null;
let isInitialized = false;
let eventListenersSetup = false;
let triggerMonitorActive = false;
let cachedBid = null;
let auctionInProgress = false;
let lastRenderAt = null;
let pageTriggerCount = 0;
let currentOverlayTrigger = null;
let cleanupCallbacks = [];
let triggerStates = {};
let configUnsubscribe = null;

// Storage keys for frequency capping. These intentionally do not reuse the
// older keys because the cap model changed.
const STORAGE_KEY_SESSION = 'exitAds_frequency_session_count';
const STORAGE_KEY_DAILY = 'exitAds_frequency_daily_count';

/**
 * Initialize the Exit Ads module.
 */
export function init() {
  if (isInitialized) {
    logWarn(`${MODULE_NAME}: Module already initialized`);
    return;
  }

  configUnsubscribe = config.getConfig(MODULE_NAME, ({ exitAds }) => {
    if (!exitAds) {
      logError(`${MODULE_NAME}: Missing configuration`);
      return;
    }

    if (!exitAds.adUnit) {
      logError(`${MODULE_NAME}: Missing adUnit configuration`);
      return;
    }

    moduleConfig = Object.assign({}, exitAds, {
      display: normalizeDisplayConfig(exitAds.display)
    });
    displayConfig = moduleConfig.display;
    configUnsubscribe(); // unsubscribe
    configUnsubscribe = null;

    logInfo(`${MODULE_NAME}: Initialized v${VERSION}`);
    isInitialized = true;

    setupEventListeners();
    injectStyles();
    startTriggerMonitoring();
  });
}

function normalizeDisplayConfig(display = {}) {
  const closeButton = Object.assign(
    {},
    DEFAULT_DISPLAY_CONFIG.closeButton,
    display.closeButton || {}
  );

  const frequency = Object.assign(
    {},
    DEFAULT_FREQUENCY,
    display.frequency || {}
  );

  const normalizedTrigger = Object.keys(DEFAULT_TRIGGER_CONFIG).reduce((result, triggerName) => {
    result[triggerName] = Object.assign(
      {},
      DEFAULT_TRIGGER_CONFIG[triggerName],
      (display.trigger && display.trigger[triggerName]) || {}
    );
    return result;
  }, {});

  if (display.trigger && display.trigger.custom) {
    normalizedTrigger.custom = normalizeCustomTrigger(display.trigger.custom);
  }

  return Object.assign({}, DEFAULT_DISPLAY_CONFIG, display, {
    closeButton,
    frequency,
    trigger: normalizedTrigger,
    cssOverrides: typeof display.cssOverrides === 'string' ? display.cssOverrides : ''
  });
}

function normalizeCustomTrigger(customConfig) {
  if (typeof customConfig === 'function') {
    return {
      enabled: true,
      repeatInterval: 60000,
      condition: customConfig
    };
  }

  return Object.assign({
    enabled: true,
    repeatInterval: 60000
  }, customConfig);
}

/**
 * Setup event listeners for Prebid events.
 */
function setupEventListeners() {
  if (eventListenersSetup) return;
  events.on(EVENTS.AUCTION_END, onAuctionEnd);
  events.on(EVENTS.BID_WON, onBidWon);
  events.on(EVENTS.AD_RENDER_FAILED, onAdRenderFailed);
  eventListenersSetup = true;
}

function removeEventListeners() {
  if (!eventListenersSetup) return;
  events.off(EVENTS.AUCTION_END, onAuctionEnd);
  events.off(EVENTS.BID_WON, onBidWon);
  events.off(EVENTS.AD_RENDER_FAILED, onAdRenderFailed);
  eventListenersSetup = false;
}

/**
 * Handle auction end event - cache the winning bid.
 */
function onAuctionEnd(auctionData) {
  if (!moduleConfig || !auctionInProgress) return;

  const exitAdUnit = auctionData.adUnits?.find(
    unit => unit.code === moduleConfig.adUnit.code
  );

  if (!exitAdUnit) return;

  const bids = auctionData.bidsReceived?.filter(
    bid => bid.adUnitCode === moduleConfig.adUnit.code
  );

  if (bids && bids.length > 0) {
    bids.sort((a, b) => b.cpm - a.cpm);
    cachedBid = bids[0];
    logInfo(`${MODULE_NAME}: Cached winning bid from ${cachedBid.bidder} with CPM ${cachedBid.cpm}`);

    if (moduleConfig.onBidCached && typeof moduleConfig.onBidCached === 'function') {
      moduleConfig.onBidCached({
        bidder: cachedBid.bidder,
        cpm: cachedBid.cpm,
        size: `${cachedBid.width}x${cachedBid.height}`
      });
    }
  } else {
    logWarn(`${MODULE_NAME}: No bids received for Exit Ad unit`);
    cachedBid = null;
  }

  auctionInProgress = false;
}

/**
 * Handle bid won event.
 */
function onBidWon(bid) {
  if (bid.adUnitCode === moduleConfig?.adUnit?.code) {
    logInfo(`${MODULE_NAME}: Bid won from ${bid.bidder}`);
  }
}

/**
 * Handle ad render failure.
 */
function onAdRenderFailed(data) {
  if (data.adUnitCode === moduleConfig?.adUnit?.code) {
    logError(`${MODULE_NAME}: Ad render failed`, data);
  }
}

/**
 * Start the ad auction for Exit Ads unit.
 */
function startAuction() {
  if (auctionInProgress) {
    logWarn(`${MODULE_NAME}: Auction already in progress`);
    return;
  }

  const pbjs = getGlobal();

  pbjs.addAdUnits([moduleConfig.adUnit]);

  auctionInProgress = true;

  pbjs.requestBids({
    adUnitCodes: [moduleConfig.adUnit.code],
    bidsBackHandler: function(bids) {
      logInfo(`${MODULE_NAME}: Bids returned`, bids);
    }
  });
}

function prefetchBid(triggerName) {
  if (cachedBid || auctionInProgress) return;
  logInfo(`${MODULE_NAME}: ${triggerName} prefetch point reached - starting auction`);
  startAuction();
}

/**
 * Start monitoring for trigger conditions.
 */
function startTriggerMonitoring() {
  if (triggerMonitorActive) return;

  triggerMonitorActive = true;
  triggerStates = {};

  const triggers = displayConfig.trigger || {};

  if (triggers.bottomOfPage?.enabled) {
    setupBottomOfPageMonitor(triggers.bottomOfPage);
  }

  if (triggers.returnToTop?.enabled) {
    setupReturnToTopMonitor(triggers.returnToTop);
  }

  if (triggers.idleTime?.enabled) {
    setupIdleTimeMonitor(triggers.idleTime);
  }

  if (triggers.tabFocusReturn?.enabled) {
    setupTabFocusReturnMonitor(triggers.tabFocusReturn);
  }

  if (triggers.appFocusReturn?.enabled) {
    setupAppFocusReturnMonitor(triggers.appFocusReturn);
  }

  if (triggers.custom?.enabled) {
    setupCustomTriggerMonitor(triggers.custom);
  }

  logInfo(`${MODULE_NAME}: Trigger monitoring started`);
}

function stopTriggerMonitoring() {
  cleanupCallbacks.forEach(cleanup => {
    try {
      cleanup();
    } catch (e) {
      logError(`${MODULE_NAME}: Error cleaning up trigger monitor`, e);
    }
  });
  cleanupCallbacks = [];
  triggerMonitorActive = false;
  triggerStates = {};
}

function addCleanup(cleanup) {
  cleanupCallbacks.push(cleanup);
}

function getTriggerState(triggerName) {
  triggerStates[triggerName] = triggerStates[triggerName] || {
    hasRendered: false,
    lastRenderAt: null
  };
  return triggerStates[triggerName];
}

/**
 * Setup bottom of page monitoring.
 */
function setupBottomOfPageMonitor(triggerConfig) {
  const triggerName = 'bottomOfPage';
  const threshold = normalizePercent(triggerConfig.threshold);
  const prefetchAtThreshold = getNumber(triggerConfig.prefetchAtThreshold);
  const normalizedPrefetchThreshold = normalizePercent(prefetchAtThreshold);
  let aboveThreshold = false;
  let abovePrefetchThreshold = false;

  const onScroll = () => {
    const scrollDepth = calculateScrollDepth();

    if (prefetchAtThreshold != null) {
      if (!abovePrefetchThreshold && scrollDepth >= normalizedPrefetchThreshold) {
        abovePrefetchThreshold = true;
        prefetchBid(triggerName);
      } else if (scrollDepth < normalizedPrefetchThreshold) {
        abovePrefetchThreshold = false;
      }
    }

    if (!aboveThreshold && scrollDepth >= threshold) {
      aboveThreshold = true;
      onTriggerActivated(triggerName);
    } else if (scrollDepth < threshold) {
      aboveThreshold = false;
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  addCleanup(() => window.removeEventListener('scroll', onScroll));
}

/**
 * Setup return-to-top monitoring.
 */
function setupReturnToTopMonitor(triggerConfig) {
  const triggerName = 'returnToTop';
  const threshold = normalizePercent(triggerConfig.threshold);
  const prefetchAtThreshold = getNumber(triggerConfig.prefetchAtThreshold);
  let hasPassedThreshold = false;
  let abovePrefetchThreshold = false;

  const onScroll = () => {
    const scrollDepth = calculateScrollDepth();

    if (prefetchAtThreshold != null) {
      const normalizedPrefetchThreshold = normalizePercent(prefetchAtThreshold);
      if (!abovePrefetchThreshold && scrollDepth >= normalizedPrefetchThreshold) {
        abovePrefetchThreshold = true;
        prefetchBid(triggerName);
      } else if (scrollDepth < normalizedPrefetchThreshold) {
        abovePrefetchThreshold = false;
      }
    }

    if (scrollDepth > threshold) {
      hasPassedThreshold = true;
      return;
    }

    if (hasPassedThreshold && scrollDepth <= threshold) {
      hasPassedThreshold = false;
      onTriggerActivated(triggerName);
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  addCleanup(() => window.removeEventListener('scroll', onScroll));
}

function calculateScrollDepth() {
  const { innerHeight: windowHeight } = getWinDimensions();
  const documentHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollableHeight = documentHeight - windowHeight;

  if (scrollableHeight <= 0) return 0;
  return (scrollTop / scrollableHeight) * 100;
}

/**
 * Setup idle time monitoring.
 */
function setupIdleTimeMonitor(triggerConfig) {
  const triggerName = 'idleTime';
  const minTime = Math.max(0, getNumber(triggerConfig.minTime) ?? 0);
  const prefetchAtTime = getNumber(triggerConfig.prefetchAtTime);
  const repeatInterval = triggerConfig.repeatInterval;
  let triggerTimeoutId;
  let prefetchTimeoutId;

  if (prefetchAtTime != null && prefetchAtTime >= 0 && prefetchAtTime < minTime) {
    prefetchTimeoutId = setTimeout(() => prefetchBid(triggerName), prefetchAtTime);
  }

  const scheduleNext = (delay) => {
    triggerTimeoutId = setTimeout(() => {
      onTriggerActivated(triggerName);

      if (repeatInterval !== null) {
        scheduleNext(Math.max(1000, getNumber(repeatInterval) ?? 0));
      }
    }, delay);
  };

  scheduleNext(minTime);

  addCleanup(() => {
    clearTimeout(triggerTimeoutId);
    clearTimeout(prefetchTimeoutId);
  });
}

/**
 * Setup tab focus return monitoring.
 */
function setupTabFocusReturnMonitor(triggerConfig) {
  const triggerName = 'tabFocusReturn';
  const minTime = Math.max(0, getNumber(triggerConfig.minTime) ?? 0);
  let hiddenAt = null;

  const onVisibilityChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }

    if (hiddenAt != null) {
      const hiddenDuration = Date.now() - hiddenAt;
      hiddenAt = null;

      if (hiddenDuration >= minTime) {
        onTriggerActivated(triggerName);
      }
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  addCleanup(() => document.removeEventListener('visibilitychange', onVisibilityChange));
}

/**
 * Setup app focus return monitoring. This only handles blur/focus while the
 * document remains visible so it does not conflict with tabFocusReturn.
 */
function setupAppFocusReturnMonitor(triggerConfig) {
  const triggerName = 'appFocusReturn';
  const minTime = Math.max(0, getNumber(triggerConfig.minTime) ?? 0);
  let blurAt = null;
  let hiddenDuringBlur = false;

  const onBlur = () => {
    if (!document.hidden) {
      blurAt = Date.now();
      hiddenDuringBlur = false;
    }
  };

  const onVisibilityChange = () => {
    if (blurAt != null && document.hidden) {
      hiddenDuringBlur = true;
    }
  };

  const onFocus = () => {
    if (blurAt == null) return;

    const blurDuration = Date.now() - blurAt;
    const shouldTrigger = !hiddenDuringBlur && !document.hidden && blurDuration >= minTime;
    blurAt = null;
    hiddenDuringBlur = false;

    if (shouldTrigger) {
      onTriggerActivated(triggerName);
    }
  };

  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('visibilitychange', onVisibilityChange);
  addCleanup(() => {
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
}

/**
 * Setup custom trigger monitoring.
 */
function setupCustomTriggerMonitor(customConfig) {
  const triggerName = 'custom';
  let intervalId;
  let customCleanup;

  const trigger = () => onTriggerActivated(triggerName);

  if (typeof customConfig.setup === 'function') {
    try {
      customCleanup = customConfig.setup({ trigger });
    } catch (e) {
      logError(`${MODULE_NAME}: Error in custom trigger setup`, e);
    }
  }

  if (typeof customConfig.condition === 'function') {
    intervalId = setInterval(() => {
      try {
        if (customConfig.condition()) {
          trigger();
        }
      } catch (e) {
        logError(`${MODULE_NAME}: Error in custom trigger condition`, e);
      }
    }, CUSTOM_POLL_INTERVAL);
  }

  addCleanup(() => {
    clearInterval(intervalId);
    if (typeof customCleanup === 'function') {
      customCleanup();
    }
  });
}

function normalizePercent(value) {
  const number = getNumber(value);
  if (number == null) return 0;
  return Math.max(0, Math.min(100, number));
}

function getNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null;
}

/**
 * Called when trigger conditions are met.
 */
function onTriggerActivated(triggerName) {
  if (!canTriggerRun(triggerName)) {
    return;
  }

  logInfo(`${MODULE_NAME}: ${triggerName} trigger activated`);

  if (moduleConfig.onTrigger && typeof moduleConfig.onTrigger === 'function') {
    moduleConfig.onTrigger({ trigger: triggerName });
  }

  if (!cachedBid && !auctionInProgress) {
    logInfo(`${MODULE_NAME}: No cached bid, starting auction...`);
    startAuction();
    waitForBidAndShow(triggerName);
  } else if (cachedBid) {
    logInfo(`${MODULE_NAME}: Using cached bid`);
    showExitAd(triggerName);
  } else if (auctionInProgress) {
    logInfo(`${MODULE_NAME}: Auction in progress, waiting for completion...`);
    waitForBidAndShow(triggerName);
  }
}

function canTriggerRun(triggerName) {
  const suppression = getTriggerSuppression(triggerName);
  if (!suppression) {
    return true;
  }

  logInfo(`${MODULE_NAME}: ${suppression.message}`);
  callTriggerSuppressed(triggerName, suppression);

  if (suppression.reason === 'frequencyCap') {
    callFrequencyCapReached(triggerName);
  }

  return false;
}

function getTriggerSuppression(triggerName) {
  const now = Date.now();
  const state = getTriggerState(triggerName);
  const triggerConfig = displayConfig.trigger[triggerName] || {};

  if (lastRenderAt != null && now - lastRenderAt < GLOBAL_RENDER_INTERVAL) {
    return {
      reason: 'globalRenderInterval',
      message: `${triggerName} trigger suppressed by the 30s global render gate`
    };
  }

  if (triggerConfig.repeatInterval === null && state.hasRendered) {
    return {
      reason: 'oncePerPageView',
      message: `${triggerName} trigger already rendered for this page view`
    };
  }

  if (
    typeof triggerConfig.repeatInterval === 'number' &&
    state.lastRenderAt != null &&
    now - state.lastRenderAt < triggerConfig.repeatInterval
  ) {
    return {
      reason: 'repeatInterval',
      message: `${triggerName} trigger suppressed by repeat interval`
    };
  }

  const frequencySuppression = getFrequencyCapSuppression();
  if (frequencySuppression) {
    return Object.assign({
      reason: 'frequencyCap',
      message: `${triggerName} trigger suppressed by ${frequencySuppression.cap} frequency cap`
    }, frequencySuppression);
  }

  return null;
}

function waitForBidAndShow(triggerName) {
  let attempts = 0;
  const maxAttempts = 50;
  const checkInterval = setInterval(() => {
    attempts++;
    if (cachedBid) {
      clearInterval(checkInterval);
      logInfo(`${MODULE_NAME}: Bid received, showing ad`);
      showExitAd(triggerName);
    } else if (attempts >= maxAttempts) {
      clearInterval(checkInterval);
      logWarn(`${MODULE_NAME}: Timeout waiting for bids, no ad to show`);
      callTriggerSuppressed(triggerName, {
        reason: 'noBid',
        message: `${triggerName} trigger did not render because no bid was returned`
      });
    }
  }, 100);

  addCleanup(() => clearInterval(checkInterval));
}

/**
 * Check frequency capping.
 */
function getFrequencyCapSuppression() {
  const freq = displayConfig.frequency || {};

  try {
    if (typeof freq.maxTriggersPerPage === 'number' && pageTriggerCount >= freq.maxTriggersPerPage) {
      logWarn(`${MODULE_NAME}: Page frequency cap reached (${pageTriggerCount}/${freq.maxTriggersPerPage})`);
      return {
        cap: 'page',
        count: pageTriggerCount,
        limit: freq.maxTriggersPerPage
      };
    }

    if (typeof freq.maxTriggersPerSession === 'number') {
      const sessionCount = parseInt(storage.getDataFromSessionStorage(STORAGE_KEY_SESSION) || '0');
      if (sessionCount >= freq.maxTriggersPerSession) {
        logWarn(`${MODULE_NAME}: Session frequency cap reached (${sessionCount}/${freq.maxTriggersPerSession})`);
        return {
          cap: 'session',
          count: sessionCount,
          limit: freq.maxTriggersPerSession
        };
      }
    }

    if (typeof freq.maxTriggersPerDay === 'number') {
      const dailyData = storage.getDataFromLocalStorage(STORAGE_KEY_DAILY);
      if (dailyData) {
        const { date, count } = JSON.parse(dailyData);
        const today = new Date().toDateString();
        if (date === today && count >= freq.maxTriggersPerDay) {
          logWarn(`${MODULE_NAME}: Daily frequency cap reached (${count}/${freq.maxTriggersPerDay})`);
          return {
            cap: 'day',
            count,
            limit: freq.maxTriggersPerDay
          };
        }
      }
    }

    return null;
  } catch (e) {
    logError(`${MODULE_NAME}: Error checking frequency cap`, e);
    return null;
  }
}

function callFrequencyCapReached(triggerName) {
  if (moduleConfig.onFrequencyCapReached && typeof moduleConfig.onFrequencyCapReached === 'function') {
    moduleConfig.onFrequencyCapReached({ trigger: triggerName });
  }
}

function callTriggerSuppressed(triggerName, suppression) {
  if (moduleConfig.onTriggerSuppressed && typeof moduleConfig.onTriggerSuppressed === 'function') {
    moduleConfig.onTriggerSuppressed(Object.assign({ trigger: triggerName }, suppression));
  }
}

/**
 * Update frequency cap counters.
 */
function updateFrequencyCap() {
  const freq = displayConfig.frequency || {};

  try {
    if (typeof freq.maxTriggersPerPage === 'number') {
      pageTriggerCount++;
    }

    if (typeof freq.maxTriggersPerSession === 'number') {
      const sessionCount = parseInt(storage.getDataFromSessionStorage(STORAGE_KEY_SESSION) || '0');
      storage.setDataInSessionStorage(STORAGE_KEY_SESSION, (sessionCount + 1).toString());
    }

    if (typeof freq.maxTriggersPerDay === 'number') {
      const today = new Date().toDateString();
      const dailyData = storage.getDataFromLocalStorage(STORAGE_KEY_DAILY);
      let count = 1;

      if (dailyData) {
        const { date, count: prevCount } = JSON.parse(dailyData);
        if (date === today) {
          count = prevCount + 1;
        }
      }

      storage.setDataInLocalStorage(STORAGE_KEY_DAILY, JSON.stringify({ date: today, count }));
    }
  } catch (e) {
    logError(`${MODULE_NAME}: Error updating frequency cap`, e);
  }
}

function updateTriggerRenderState(triggerName) {
  const now = Date.now();
  const state = getTriggerState(triggerName);
  state.hasRendered = true;
  state.lastRenderAt = now;
  lastRenderAt = now;
}

/**
 * Show the Exit Ad.
 */
function showExitAd(triggerName) {
  if (!cachedBid) {
    logWarn(`${MODULE_NAME}: No cached bid to display`);
    callTriggerSuppressed(triggerName, {
      reason: 'noCachedBid',
      message: `${triggerName} trigger did not render because no cached bid was available`
    });
    return;
  }

  if (!canTriggerRun(triggerName)) {
    return;
  }

  logInfo(`${MODULE_NAME}: Displaying Exit Ad`, cachedBid);

  const displayType = displayConfig.type || 'overlay';

  if (displayType === 'overlay') {
    showOverlay(triggerName);
  } else if (displayType === 'interstitial') {
    showInterstitial(triggerName);
  } else {
    logWarn(`${MODULE_NAME}: Unknown display type "${displayType}", using overlay`);
    showOverlay(triggerName);
  }

  cachedBid = null;

  updateFrequencyCap();
  updateTriggerRenderState(triggerName);

  if (moduleConfig.onAdRender && typeof moduleConfig.onAdRender === 'function') {
    moduleConfig.onAdRender({ trigger: triggerName });
  }
}

function injectStyles() {
  replaceStyleTag(BASE_STYLE_ID, BASE_CSS);
  replaceStyleTag(OVERRIDE_STYLE_ID, displayConfig.cssOverrides || '');
}

function replaceStyleTag(id, cssText) {
  const existing = document.getElementById(id);
  if (existing) {
    existing.parentNode.removeChild(existing);
  }

  if (!cssText) return;

  const style = document.createElement('style');
  style.id = id;
  style.type = 'text/css';
  style.textContent = cssText;
  document.head.appendChild(style);
}

function removeStyles() {
  [BASE_STYLE_ID, OVERRIDE_STYLE_ID].forEach(id => {
    const style = document.getElementById(id);
    if (style) {
      style.parentNode.removeChild(style);
    }
  });
}

/**
 * Show overlay ad.
 */
function showOverlay(triggerName) {
  const existingOverlay = document.getElementById('exit-ads-overlay');
  if (existingOverlay) {
    existingOverlay.parentNode.removeChild(existingOverlay);
  }

  const overlay = document.createElement('div');
  overlay.id = 'exit-ads-overlay';
  overlay.className = 'exit-ads-overlay';
  overlay.setAttribute('data-exit-ads-trigger', triggerName);

  const adContainer = document.createElement('div');
  adContainer.id = moduleConfig.adUnit.code;
  adContainer.className = 'exit-ads-container';
  adContainer.style.setProperty('--exit-ads-container-min-width', `${cachedBid.width || 300}px`);
  adContainer.style.setProperty('--exit-ads-container-min-height', `${cachedBid.height || 250}px`);

  if (cachedBid.ad) {
    adContainer.innerHTML = cachedBid.ad;
  } else {
    logError(`${MODULE_NAME}: Cached bid has no ad creative`);
  }

  if (displayConfig.closeButton?.enabled !== false) {
    adContainer.appendChild(createCloseButton(triggerName));
  }

  overlay.appendChild(adContainer);
  document.body.appendChild(overlay);
  currentOverlayTrigger = triggerName;
}

function createCloseButton(triggerName) {
  const closeButton = document.createElement('button');
  closeButton.className = 'exit-ads-close-button';
  closeButton.innerHTML = '&times;';

  const closeDelay = Math.max(0, getNumber(displayConfig.closeButton?.delay) ?? 0);
  if (closeDelay > 0) {
    closeButton.disabled = true;
    closeButton.classList.add('exit-ads-close-button--disabled', 'exit-ads-close-button--countdown');

    let remainingSeconds = Math.ceil(closeDelay / 1000);
    closeButton.innerHTML = remainingSeconds;

    const countdownInterval = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds > 0) {
        closeButton.innerHTML = remainingSeconds;
      } else {
        clearInterval(countdownInterval);
        closeButton.innerHTML = '&times;';
        closeButton.disabled = false;
        closeButton.classList.remove('exit-ads-close-button--disabled', 'exit-ads-close-button--countdown');
      }
    }, 1000);

    addCleanup(() => clearInterval(countdownInterval));
  }

  closeButton.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    closeExitAd(triggerName);
  };

  return closeButton;
}

/**
 * Show interstitial ad.
 */
function showInterstitial(triggerName) {
  showOverlay(triggerName);
}

/**
 * Close the Exit Ad.
 */
function closeExitAd(triggerName = currentOverlayTrigger) {
  const overlay = document.getElementById('exit-ads-overlay');
  if (overlay && overlay.getAttribute('data-closed') !== 'true') {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.display = 'none';
    overlay.setAttribute('data-closed', 'true');
    lastRenderAt = Date.now();
  }

  if (moduleConfig.onAdClose && typeof moduleConfig.onAdClose === 'function') {
    moduleConfig.onAdClose({ trigger: triggerName });
  }

  logInfo(`${MODULE_NAME}: Exit Ad closed`);
}

/**
 * Manual trigger function exposed to publishers.
 */
export function triggerExitAd() {
  if (!isInitialized) {
    logWarn(`${MODULE_NAME}: Module not initialized`);
    return;
  }

  const triggerName = 'manual';

  const manualSuppression = getTriggerSuppression(triggerName);
  if (manualSuppression) {
    logInfo(`${MODULE_NAME}: ${manualSuppression.message}`);
    callTriggerSuppressed(triggerName, manualSuppression);

    if (manualSuppression.reason === 'frequencyCap') {
      callFrequencyCapReached(triggerName);
    }
    return;
  }

  logInfo(`${MODULE_NAME}: Manual trigger activated`);

  if (moduleConfig.onTrigger && typeof moduleConfig.onTrigger === 'function') {
    moduleConfig.onTrigger({ trigger: triggerName });
  }

  if (!cachedBid && !auctionInProgress) {
    logInfo(`${MODULE_NAME}: No cached bid, starting auction...`);
    startAuction();
    waitForBidAndShow(triggerName);
  } else if (cachedBid) {
    logInfo(`${MODULE_NAME}: Using cached bid`);
    showExitAd(triggerName);
  } else if (auctionInProgress) {
    logInfo(`${MODULE_NAME}: Auction in progress, waiting for completion...`);
    waitForBidAndShow(triggerName);
  }
}

/**
 * Reset module state.
 */
export function reset() {
  if (configUnsubscribe) {
    configUnsubscribe();
    configUnsubscribe = null;
  }

  stopTriggerMonitoring();
  removeEventListeners();
  removeStyles();

  cachedBid = null;
  auctionInProgress = false;
  isInitialized = false;
  moduleConfig = null;
  displayConfig = null;
  lastRenderAt = null;
  pageTriggerCount = 0;
  currentOverlayTrigger = null;

  const overlay = document.getElementById('exit-ads-overlay');
  if (overlay) {
    overlay.parentNode.removeChild(overlay);
  }

  init();
}

/**
 * Module registration.
 */
const pbjs = getGlobal();
init();

pbjs.exitAds = {
  trigger: triggerExitAd,
  reset: reset,
  version: VERSION
};

logInfo(`${MODULE_NAME}: Module loaded v${VERSION}`);
