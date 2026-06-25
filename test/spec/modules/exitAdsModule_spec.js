import { config } from 'src/config.js';
import * as events from 'src/events.js';
import { EVENTS } from 'src/constants.js';
import { getGlobal } from 'src/prebidGlobal.js';
import { resetWinDimensions } from 'src/utils/winDimensions.js';
import { reset as resetExitAds, triggerExitAd } from 'modules/exitAdsModule/index.js';

describe('exitAdsModule', function () {
  const adUnit = {
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
          zone: 'test-zone',
          slot: 'test-slot'
        }
      }
    ]
  };

  const bid = {
    adUnitCode: adUnit.code,
    bidder: 'gumgum',
    cpm: 1.25,
    width: 300,
    height: 250,
    ad: '<div id="exit-ad-creative">creative</div>'
  };

  const disabledTriggers = {
    bottomOfPage: { enabled: false },
    returnToTop: { enabled: false },
    idleTime: { enabled: false },
    tabFocusReturn: { enabled: false },
    appFocusReturn: { enabled: false }
  };

  let clock;
  let pbjs;
  let addAdUnitsStub;
  let requestBidsStub;
  let originalAddAdUnits;
  let originalRequestBids;

  beforeEach(function () {
    clock = sinon.useFakeTimers(1000000);
    resetExitAds();
    config.resetConfig();
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    resetWinDimensions();
    document.head.querySelectorAll('#exit-ads-base-styles, #exit-ads-override-styles').forEach(el => el.remove());

    pbjs = getGlobal();
    originalAddAdUnits = pbjs.addAdUnits;
    originalRequestBids = pbjs.requestBids;
    addAdUnitsStub = pbjs.addAdUnits = sinon.stub();
    requestBidsStub = pbjs.requestBids = sinon.stub();
  });

  afterEach(function () {
    if (originalAddAdUnits) {
      pbjs.addAdUnits = originalAddAdUnits;
    } else {
      delete pbjs.addAdUnits;
    }

    if (originalRequestBids) {
      pbjs.requestBids = originalRequestBids;
    } else {
      delete pbjs.requestBids;
    }

    resetExitAds();
    config.resetConfig();
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.body.innerHTML = '';
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    resetWinDimensions();
    clock.restore();
  });

  function configure({ display, callbacks } = {}) {
    config.setConfig({
      exitAds: Object.assign({
        adUnit
      }, callbacks || {}, display === undefined ? {} : { display })
    });
  }

  function completeAuction(auctionBid = bid) {
    events.emit(EVENTS.AUCTION_END, {
      adUnits: [adUnit],
      bidsReceived: [auctionBid]
    });
  }

  function completeAuctionWithNoBid() {
    events.emit(EVENTS.AUCTION_END, {
      adUnits: [adUnit],
      bidsReceived: []
    });
  }

  function completeAuctionAndRender(auctionBid = bid) {
    completeAuction(auctionBid);
    clock.tick(100);
  }

  function setScrollDepth(depth) {
    let spacer = document.getElementById('exit-ads-scroll-spacer');
    if (!spacer) {
      spacer = document.createElement('div');
      spacer.id = 'exit-ads-scroll-spacer';
      spacer.style.height = '2000px';
      document.body.appendChild(spacer);
    }

    const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
    const scrollTop = Math.round((depth / 100) * scrollableHeight);

    window.scrollTo(0, scrollTop);
    document.documentElement.scrollTop = scrollTop;
    document.body.scrollTop = scrollTop;
    resetWinDimensions();
    window.dispatchEvent(new Event('scroll'));
  }

  function setDocumentHidden(hidden) {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function oneTriggerDisplay(triggerName, triggerConfig = {}) {
    const baseTriggerConfig = {
      enabled: true,
      repeatInterval: 60000
    };

    if (triggerName === 'bottomOfPage' || triggerName === 'returnToTop') {
      baseTriggerConfig.prefetchAtThreshold = null;
    } else if (triggerName === 'idleTime') {
      baseTriggerConfig.prefetchAtTime = null;
    }

    return {
      closeButton: {
        enabled: true,
        delay: 0
      },
      frequency: {
        maxTriggersPerPage: 10,
        maxTriggersPerSession: 10,
        maxTriggersPerDay: 10
      },
      trigger: Object.assign({}, disabledTriggers, {
        [triggerName]: Object.assign(baseTriggerConfig, triggerConfig)
      })
    };
  }

  it('uses default display, trigger, frequency, close button, and styles when display is omitted', function () {
    configure();

    clock.tick(29999);
    sinon.assert.notCalled(requestBidsStub);

    clock.tick(1);
    sinon.assert.called(requestBidsStub);
    completeAuction();

    clock.tick(30000);

    const overlay = document.getElementById('exit-ads-overlay');
    const closeButton = document.querySelector('.exit-ads-close-button');

    expect(overlay).to.exist;
    expect(overlay.classList.contains('exit-ads-overlay')).to.equal(true);
    expect(closeButton.disabled).to.equal(true);
    expect(document.getElementById('exit-ads-base-styles')).to.exist;
  });

  it('prefetches at bottomOfPage threshold and renders at display threshold', function () {
    const onTrigger = sinon.spy();
    configure({
      display: oneTriggerDisplay('bottomOfPage', {
        threshold: 90,
        prefetchAtThreshold: 70
      }),
      callbacks: {
        onTrigger
      }
    });

    setScrollDepth(75);

    sinon.assert.called(requestBidsStub);
    sinon.assert.notCalled(onTrigger);

    completeAuction();
    setScrollDepth(95);

    sinon.assert.calledOnce(onTrigger);
    expect(document.querySelector('#exit-ad-creative')).to.exist;
  });

  it('prefetches after returnToTop prefetch threshold and renders after returning to top threshold', function () {
    const onTrigger = sinon.spy();
    configure({
      display: oneTriggerDisplay('returnToTop', {
        threshold: 10,
        prefetchAtThreshold: 50
      }),
      callbacks: {
        onTrigger
      }
    });

    setScrollDepth(55);

    sinon.assert.called(requestBidsStub);
    sinon.assert.notCalled(onTrigger);

    completeAuction();
    setScrollDepth(5);

    sinon.assert.calledOnce(onTrigger);
    expect(document.querySelector('#exit-ad-creative')).to.exist;
  });

  it('prefetches idleTime before rendering at minTime', function () {
    const onTrigger = sinon.spy();
    configure({
      display: oneTriggerDisplay('idleTime', {
        minTime: 60000,
        prefetchAtTime: 30000
      }),
      callbacks: {
        onTrigger
      }
    });

    clock.tick(29999);
    sinon.assert.notCalled(requestBidsStub);

    clock.tick(1);
    sinon.assert.called(requestBidsStub);
    sinon.assert.notCalled(onTrigger);

    completeAuction();
    clock.tick(30000);

    sinon.assert.calledOnce(onTrigger);
    expect(document.querySelector('#exit-ad-creative')).to.exist;
  });

  it('fires tabFocusReturn for hidden-to-visible transitions after minTime', function () {
    const onTrigger = sinon.spy();
    configure({
      display: oneTriggerDisplay('tabFocusReturn', {
        minTime: 1000
      }),
      callbacks: {
        onTrigger
      }
    });

    setDocumentHidden(true);
    clock.tick(999);
    setDocumentHidden(false);
    sinon.assert.notCalled(requestBidsStub);

    setDocumentHidden(true);
    clock.tick(1000);
    setDocumentHidden(false);

    sinon.assert.called(requestBidsStub);
    sinon.assert.calledWith(onTrigger, sinon.match({ trigger: 'tabFocusReturn' }));
  });

  it('fires appFocusReturn only when blur/focus happens while the page remains visible', function () {
    const onTrigger = sinon.spy();
    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 10,
          maxTriggersPerSession: 10,
          maxTriggersPerDay: 10
        },
        trigger: Object.assign({}, disabledTriggers, {
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
        })
      },
      callbacks: {
        onTrigger
      }
    });

    setDocumentHidden(false);
    window.dispatchEvent(new Event('blur'));
    setDocumentHidden(true);
    clock.tick(1000);
    setDocumentHidden(false);
    window.dispatchEvent(new Event('focus'));

    sinon.assert.called(requestBidsStub);
    sinon.assert.calledWith(onTrigger, sinon.match({ trigger: 'tabFocusReturn' }));

    completeAuctionWithNoBid();
    clock.tick(30000);
    window.dispatchEvent(new Event('blur'));
    clock.tick(1000);
    window.dispatchEvent(new Event('focus'));

    sinon.assert.calledTwice(requestBidsStub);
    sinon.assert.calledWith(onTrigger.secondCall, sinon.match({ trigger: 'appFocusReturn' }));
  });

  it('enforces the hard global render interval across triggers and manual triggers', function () {
    let customTrigger;
    const onTrigger = sinon.spy();
    const onTriggerSuppressed = sinon.spy();
    configure({
      display: oneTriggerDisplay('custom', {
        repeatInterval: 0,
        setup: function({ trigger }) {
          customTrigger = trigger;
        }
      }),
      callbacks: {
        onTrigger,
        onTriggerSuppressed
      }
    });

    customTrigger();
    completeAuctionAndRender();
    expect(document.querySelector('#exit-ad-creative')).to.exist;
    requestBidsStub.resetHistory();
    onTrigger.resetHistory();

    clock.tick(29900);
    triggerExitAd();
    sinon.assert.notCalled(requestBidsStub);
    sinon.assert.notCalled(onTrigger);
    sinon.assert.calledOnce(onTriggerSuppressed);
    sinon.assert.calledWith(onTriggerSuppressed, sinon.match({
      trigger: 'manual',
      reason: 'globalRenderInterval'
    }));

    clock.tick(100);
    triggerExitAd();
    sinon.assert.calledOnce(onTrigger);
    sinon.assert.calledWith(onTrigger, sinon.match({ trigger: 'manual' }));
    sinon.assert.called(requestBidsStub);
  });

  it('extends the hard global render interval when the user closes the ad', function () {
    let customTrigger;
    const onTrigger = sinon.spy();
    const onTriggerSuppressed = sinon.spy();
    configure({
      display: oneTriggerDisplay('custom', {
        repeatInterval: 0,
        setup: function({ trigger }) {
          customTrigger = trigger;
        }
      }),
      callbacks: {
        onTrigger,
        onTriggerSuppressed
      }
    });

    customTrigger();
    completeAuctionAndRender();
    document.querySelector('.exit-ads-close-button').click();
    requestBidsStub.resetHistory();
    onTrigger.resetHistory();

    clock.tick(29900);
    triggerExitAd();

    sinon.assert.notCalled(requestBidsStub);
    sinon.assert.notCalled(onTrigger);
    sinon.assert.calledWith(onTriggerSuppressed, sinon.match({
      trigger: 'manual',
      reason: 'globalRenderInterval'
    }));

    clock.tick(100);
    triggerExitAd();

    sinon.assert.calledOnce(onTrigger);
    sinon.assert.calledWith(onTrigger, sinon.match({ trigger: 'manual' }));
  });

  it('supports repeatInterval null as once per page view', function () {
    configure({
      display: oneTriggerDisplay('bottomOfPage', {
        threshold: 90,
        repeatInterval: null
      })
    });

    setScrollDepth(95);
    completeAuctionAndRender();
    requestBidsStub.resetHistory();

    clock.tick(30000);
    setScrollDepth(80);
    setScrollDepth(95);

    sinon.assert.notCalled(requestBidsStub);
  });

  it('allows repeatInterval zero after the global render interval', function () {
    configure({
      display: oneTriggerDisplay('bottomOfPage', {
        threshold: 90,
        repeatInterval: 0
      })
    });

    setScrollDepth(95);
    completeAuctionAndRender();
    requestBidsStub.resetHistory();

    clock.tick(30000);
    setScrollDepth(80);
    setScrollDepth(95);

    sinon.assert.called(requestBidsStub);
  });

  it('applies global frequency caps to successful manual renders only', function () {
    const onFrequencyCapReached = sinon.spy();
    const onTriggerSuppressed = sinon.spy();
    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 1,
          maxTriggersPerSession: 1,
          maxTriggersPerDay: 1
        },
        trigger: disabledTriggers
      },
      callbacks: {
        onFrequencyCapReached,
        onTriggerSuppressed
      }
    });

    triggerExitAd();
    completeAuctionAndRender();

    expect(window.sessionStorage.getItem('exitAds_frequency_session_count')).to.equal('1');
    expect(JSON.parse(window.localStorage.getItem('exitAds_frequency_daily_count')).count).to.equal(1);
    requestBidsStub.resetHistory();

    clock.tick(30000);
    triggerExitAd();

    sinon.assert.calledOnce(onFrequencyCapReached);
    sinon.assert.calledOnce(onTriggerSuppressed);
    sinon.assert.calledWith(onTriggerSuppressed, sinon.match({
      trigger: 'manual',
      reason: 'frequencyCap',
      cap: 'page'
    }));
    sinon.assert.notCalled(requestBidsStub);
  });

  it('does not consume frequency caps or repeat timing when no bid renders', function () {
    const onTriggerSuppressed = sinon.spy();
    configure({
      display: oneTriggerDisplay('bottomOfPage', {
        threshold: 90,
        repeatInterval: 60000
      }),
      callbacks: {
        onTriggerSuppressed
      }
    });

    setScrollDepth(95);
    completeAuctionWithNoBid();
    clock.tick(5000);

    expect(window.sessionStorage.getItem('exitAds_frequency_session_count')).to.equal(null);
    sinon.assert.calledWith(onTriggerSuppressed, sinon.match({
      trigger: 'bottomOfPage',
      reason: 'noBid'
    }));

    setScrollDepth(80);
    setScrollDepth(95);

    sinon.assert.calledTwice(requestBidsStub);
  });

  it('supports custom setup cleanup and custom condition shorthand', function () {
    let customTrigger;
    const cleanup = sinon.spy();

    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 10,
          maxTriggersPerSession: 10,
          maxTriggersPerDay: 10
        },
        trigger: Object.assign({}, disabledTriggers, {
          custom: {
            enabled: true,
            repeatInterval: 60000,
            setup: function({ trigger }) {
              customTrigger = trigger;
              return cleanup;
            }
          }
        })
      }
    });

    customTrigger();
    sinon.assert.called(requestBidsStub);

    resetExitAds();
    sinon.assert.calledOnce(cleanup);

    let shouldTrigger = false;
    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 10,
          maxTriggersPerSession: 10,
          maxTriggersPerDay: 10
        },
        trigger: Object.assign({}, disabledTriggers, {
          custom: function() {
            return shouldTrigger;
          }
        })
      }
    });

    clock.tick(1000);
    sinon.assert.called(requestBidsStub);

    shouldTrigger = true;
    clock.tick(1000);
    sinon.assert.calledTwice(requestBidsStub);
  });

  it('injects base and override CSS once and replaces them on reset/reconfigure', function () {
    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 10,
          maxTriggersPerSession: 10,
          maxTriggersPerDay: 10
        },
        trigger: disabledTriggers,
        cssOverrides: '.exit-ads-overlay { background: red; }'
      }
    });

    expect(document.querySelectorAll('#exit-ads-base-styles').length).to.equal(1);
    expect(document.querySelectorAll('#exit-ads-override-styles').length).to.equal(1);
    expect(document.getElementById('exit-ads-override-styles').textContent).to.contain('background: red');

    resetExitAds();
    configure({
      display: {
        closeButton: {
          enabled: true,
          delay: 0
        },
        frequency: {
          maxTriggersPerPage: 10,
          maxTriggersPerSession: 10,
          maxTriggersPerDay: 10
        },
        trigger: disabledTriggers,
        cssOverrides: '.exit-ads-container { padding: 0; }'
      }
    });

    expect(document.querySelectorAll('#exit-ads-base-styles').length).to.equal(1);
    expect(document.querySelectorAll('#exit-ads-override-styles').length).to.equal(1);
    expect(document.getElementById('exit-ads-override-styles').textContent).to.contain('padding: 0');
  });
});
