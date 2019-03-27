/* eslint-disable */
import AuctionBase from './auctionBase';

const DEFAULT = {
  failsafeTimeout: 2000,
};

const DEFAULT_GOOGLE_PATH_PREPEND = '/3377764/';

class PrebidAuction extends AuctionBase
{
  constructor(worker, params) {
    super(worker, params, DEFAULT);
    this.unitsByCode = {};
    this.adUnits.forEach((adUnit) => {
      this.unitsByCode[adUnit.code] = adUnit;
    });
  }

  sendAdserverRequest(gotBids) {
    this.log(`Sending adserver request ${gotBids ? 'WITHOUT bids (timeout)' : 'with bids'}`);
    this.adserver.sendAdserverRequest(this);
  }

  init() {
    super.init();
    this.event('onInitPrebid');
    this.adserver.initPrebidAuction(this);
    this.pbjs.addsAdUnits(this.adUnits);
    this.pbjs.requestBids({
      adUnitCodes: this.adUnits.map(unit => unit.code),
      timeout: this.bidTimeOut,
      bidsBackHandler: () => this.sendAdserverRequest(true),
    });
    this.event('onInitPrebidDone');
    setTimeout(() => this.sendAdserverRequest(false), this.failsafeTimeout);
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
    if (adUnit) {
      return false;
    }

    const getSizes = () => {
      const sizes = ((adUnit.mediaTypes || {}).banner || {}).sizes || adUnit.sizes || param.sizes;
      if(!sizes || !sizes.length) {
        throw Error(`Failed gettings sizes for adUnit '${code}'`);
      }
    }

    const newParams = {
      isPostPrebid: true,
      logIdentifier: code,
      sizes: getSizes(),
      adserverType: adserverType,
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
