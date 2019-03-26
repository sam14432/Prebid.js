/* eslint-disable */

import Hacks from "./hacks";
import { mergeNonExisting } from './utils';

const DEFAULT = {
  bidTimeOut: 1000,
  logIdentifier: null,
  adserverType: 'dfp',
  pbjsConfig: null,
};

const PREBID_DEFAULT_CONFIG = {
  consentManagement: {},
  debug: this.worker.prebidDebug,
  rubicon: {
    singleRequest: true,
  }
}

class AuctionBase
{
  constructor(worker, params, defaultValues) {
    let pageConfig = { worker };
    Object.assign(this, DEFAULT, defaultValues, pageConfig || {}, params, {
      worker,
      pbjs: worker.pbjs,
    });
    this.adserver = worker.getAdserver(this.adserverType);
  }

  auctionType() { return 'unknown'; }

  log(str) {
    this.worker.constructor.log(`${this.auctionType()}: ${this.logIdentifier ? `${this.logIdentifier} - ` : ''}${str}`);
  }

  event(type, params = {}) {
    params.auction = this;
    if(this.events && this.events[type]) {
      this.events[type](params);
    }
    this.hacks.forEach((hack) => {
      if(hack[type]) {
        hack[type](params);
      }
    });
    this.worker.event(type, params);
    if(this[type]) {
      this[type](params);
    }
  }

  init() {
    this.log('Init');
    this.hacks = Hacks.filter(hack => hack.matches(this));
    if(!AuctionBase.pbjsConfigSet) {
      AuctionBase.pbjsConfigSet = true;
      const cfg = mergeNonExisting({}, this.pbjsConfig, adserver.getPbjsConfig(), PREBID_DEFAULT_CONFIG);
      this.pbjs.setConfig(cfg);
    }
  }

}

export default PrebidAuction;
