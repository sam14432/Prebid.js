/* eslint-disable */
import find from 'core-js-pure/features/array/find.js';
import AuctionBase from './auctionBase';
import Reloader from './reloader';
import { isFunction } from './utils';
import { DEFAULT_GOOGLE_PATH_PREPEND } from './constants';

const DEFAULT = {
  failsafeTimeout: 1000,
  delayStartPrebid: true,
};

const PREBID_COPY_VARS = [
  'hacks',
  'checkIvl',
  'sizeCheckDuration',
  'adserverType',
  'forcePassbackInIframe',
  'useIframeResizer',
  'hidePassbackUntilFinished',
  'googleCollapseEmptyDivStyle',
];

class PrebidAuction extends AuctionBase
{
  constructor(worker, params) {
    super(worker, params, DEFAULT);
    this.unitsByCode = {};
    let filterFn = () => true;
    const { allowedAdUnits } = this;
    if(allowedAdUnits) {
      if (isFunction(allowedAdUnits)) {
        filterFn = allowedAdUnits
      } else if (Array.isArray(allowedAdUnits)) {
        filterFn = u => allowedAdUnits.indexOf(u.code) >= 0;
      }
    }
    this.adUnits = this.adUnits.filter(filterFn);
    this.adUnits.forEach((adUnit) => {
      this.unitsByCode[adUnit.code] = adUnit;
    });
    if (Reloader.needReloader(this)) {
      this.reloader = new Reloader(worker, this);
    }
  }

  auctionType() { return 'prebid'; }

  allAdUnits() {
    const res = [];
    for(const key in this.unitsByCode) {
      res.push(this.unitsByCode[key]);
    }
    return res;
  }

  sendAdserverRequest(gotTimeout, settings = {}) {
    if (this.adserverRequestTriggered && !settings.isReload) {
      return;
    }
    this.adserverRequestTriggered = true;
    this.log(`Sending adserver request ${gotTimeout ? 'WITHOUT all bids (timeout)' : 'with all bids'}`);
    this.adserver.sendAdserverRequest(this, settings);
  }

  startPrebid(codes, isReload) {
    const { pbjs } = this.worker;
    const adUnits = this.allAdUnits().filter(unit => (!unit.prebidStarted || isReload) && (!codes || codes.indexOf(unit.code) >= 0));
    if(!adUnits.length) {
      return [];
    }
    this.log(`Requesting bids: ${ adUnits.map(u => u.code).join(', ')}`);
    if (!isReload) {
      pbjs.addAdUnits(adUnits);
    }
    adUnits.forEach((adUnit) => {
      adUnit.prebidStarted = true;
      adUnit.prebidGotBidsBack = false;
    });
    pbjs.requestBids({
      adUnitCodes: adUnits.map(unit => unit.code),
      //timeout: this.bidTimeOut,
      bidsBackHandler: () => {
        this.log(`Bids back: ${ adUnits.map(u => u.code).join(', ')}`);
        adUnits.forEach((adUnit) => {
          adUnit.prebidGotBidsBack = true;
        });
        if(!find(this.allAdUnits, u => u.prebidStarted && !u.prebidGotBidsBack)) {
          this.sendAdserverRequest(false, { isReload, adUnits });
          if (this.reloader) {
            this.reloader.onPrebidFinished(this);
          }
        }
      },
    });
    return adUnits;
  }

  init() {
    super.init();
    this.event('onInitPrebid');
    this.adserver.initPrebidAuction(this);
    if(!this.delayStartPrebid) {
      this.startPrebid();
    }
    this.event('onInitPrebidDone');
    setTimeout(() => this.sendAdserverRequest(true), this.failsafeTimeout);
  }

  hasPrebidAd(code) {
    const { pbjs } = this.worker;
    var params = pbjs.getAdserverTargetingForAdUnitCode(code);
    return !!(params && params.hb_adid);
  }

  renderUsingParams(param, calledFromPostbid) {
    if(calledFromPostbid && this.worker.getAdserver(param.adserverType) !== this.adserver) {
      return false;
    }
    const code = this.adserver.getAdUnitCodeFromParams(this, param);
    if(!code) {
      return false;
    }
    const adUnit = this.unitsByCode[code];
    if (!adUnit || !adUnit.prebidStarted) {
      return false;
    }

    const getSizes = () => {
      const sizes = ((adUnit.mediaTypes || {}).banner || {}).sizes || adUnit.sizes || param.sizes;
      if(!sizes || !sizes.length) {
        throw Error(`Failed gettings sizes for adUnit '${code}'`);
      }
      return sizes;
    }

    const newParams = {
      isPostPrebid: true,
      logIdentifier: code,
      sizes: getSizes(),
      hacks: this.hacks,
      unitId: code,
      existingLegacyIframe: param.existingLegacyIframe,
      events: param.events,
    };
    PREBID_COPY_VARS.forEach((varName) => {
      if(varName in this) {
        newParams[varName] = this[varName];
      }
    });

    /** googlePassbackUnit not specified in adUnit => use from postbid if it exist
     *  googlePassbackUnit is null/empty in adUnit => no dfp passback */
    if('googlePassbackUnit' in adUnit) {
      let googlePassbackUnit = (adUnit.googlePassbackUnit || '').trim();
      if (googlePassbackUnit && googlePassbackUnit.indexOf('/') < 0) {
        googlePassbackUnit = `${DEFAULT_GOOGLE_PATH_PREPEND}${googlePassbackUnit}`;
      }
      newParams.googlePassbackUnit = googlePassbackUnit || null;
    }
    newParams.googleDimensions = adUnit.googleDimensions;

    const adserverParams = this.adserver.getPostPrebidParams(this, adUnit, calledFromPostbid ? param : null, newParams);
    if(!adserverParams) {
      return false; // For Smart this might happen if we got a bid, but after "no-ad" was returned the tag <div> *still* doesn't exist
    }
    Object.assign(newParams, adserverParams);

    this.worker.push({
      cmd: 'postbid',
      param: newParams,
      groupMaxDelay: calledFromPostbid ? 0 : undefined, // if from postbid => we have already waited
    });
    return true;
  }

}

export default PrebidAuction;
