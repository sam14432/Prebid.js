/* eslint-disable */
import find from 'core-js/library/fn/array/find';
import AuctionBase from './auctionBase';
import { DEFAULT_GOOGLE_PATH_PREPEND } from './constants';

const DEFAULT = {
  failsafeTimeout: 2000,
  delayStartPrebid: true,
};

class PrebidAuction extends AuctionBase
{
  constructor(worker, params) {
    super(worker, params, DEFAULT);
    this.unitsByCode = {};
    this.adUnits.forEach((adUnit) => {
      this.unitsByCode[adUnit.code] = adUnit;
    });
  }

  auctionType() { return 'prebid'; }

  allAdUnits() {
    const res = [];
    for(const key in this.unitsByCode) {
      res.push(this.unitsByCode[key]);
    }
    return res;
  }

  sendAdserverRequest(gotTimeout) {
    if (this.adserverRequestTriggered) {
      return;
    }
    this.adserverRequestTriggered = true;
    this.log(`Sending adserver request ${gotTimeout ? 'WITHOUT all bids (timeout)' : 'with all bids'}`);
    this.adserver.sendAdserverRequest(this);
  }

  startPrebid(codes) {
    const { pbjs } = this.worker;
    const adUnits = this.allAdUnits().filter(unit => !unit.prebidStarted && (!codes || codes.indexOf(unit.code) >= 0));
    if(!adUnits.length) {
      return [];
    }
    this.log(`Requesting bids: ${ adUnits.map(u => u.code).join(', ')}`);
    pbjs.addAdUnits(adUnits);
    adUnits.forEach((adUnit) => {
      adUnit.prebidStarted = true;
    });
    pbjs.requestBids({
      adUnitCodes: adUnits.map(unit => unit.code),
      timeout: this.bidTimeOut,
      bidsBackHandler: () => {
        this.log(`Bids back: ${ adUnits.map(u => u.code).join(', ')}`);
        adUnits.forEach((adUnit) => {
          adUnit.prebidGotBidsBack = true;
        });
        if(!find(this.allAdUnits, u => u.prebidStarted && !u.prebidGotBidsBack)) {
          this.sendAdserverRequest(false);
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
      adserverType: this.adserverType,
      hacks: this.hacks,
    };

    /** googlePassbackUnit not specified in adUnit => use from postbid if it exist
     *  googlePassbackUnit is null/empty in adUnit => no dfp passback */
    if('googlePassbackUnit' in adUnit) {
      let googlePassbackUnit = (adUnit.googlePassbackUnit || '').trim();
      if (googlePassbackUnit && googlePassbackUnit.indexOf('/') < 0) {
        googlePassbackUnit = `${DEFAULT_GOOGLE_PATH_PREPEND}${googlePassbackUnit}`;
      }
      newParams.googlePassbackUnit = googlePassbackUnit || null;
    }

    const adserverParams = this.adserver.getPostPrebidParams(this, adUnit, calledFromPostbid ? param : null, newParams);
    if(!adserverParams) {
      return false; // For Smart this might happen if we got a bid, but after "no-ad" was returned the tag <div> *still* doesn't exist
    }
    Object.assign(newParams, adserverParams);

    this.worker.push({ cmd: 'postbid', param: newParams });
    return true;
  }

  addWinningBid(code, bid) {
    this.winningBidsByCode[code] = bid;
  }

  getWinningBid(code) {
    return this.winningBids[code];
  }

}

export default PrebidAuction;
