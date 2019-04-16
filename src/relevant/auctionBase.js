/* eslint-disable */

import Hacks from "./hacks";
import { mergeNonExisting } from './utils';

const DEFAULT = {
  bidTimeOut: 1000,
  logIdentifier: null,
  adserverType: 'dfp',
  pbjsConfig: null,
  useIframeResizer: true,
  sizeCheckIvl: 500,
  sizeCheckDuration: 5000,
};

class AuctionBase
{
  constructor(worker, params, defaultValues) {
    let { pageConfig } = worker;
    this.adserver = worker.getAdserver(params.adserverType);
    const allDefaults = Object.assign({}, DEFAULT, defaultValues, this.adserver.getAdserverDefaults());
    const fromPageConfig = {};
    for(const key in pageConfig) {
      if(key in allDefaults) {
        fromPageConfig[key] = pageConfig[key];
      }
    }
    Object.assign(this, allDefaults, params, fromPageConfig, params.pageOverrideParams, {
      worker,
      pbjs: worker.pbjs,
    });
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
    if(!this.hacks) { // might have been copied from prebid => postprebid
      this.hacks = Hacks.filter(hack => hack.matches(this));
    }
    if(!AuctionBase.pbjsConfigSet) {
      AuctionBase.pbjsConfigSet = true;
      const PREBID_DEFAULT_CONFIG = {
        consentManagement: {},
        debug: this.worker.prebidDebug,
        rubicon: {
          singleRequest: true,
        }
      }
      const cfg = mergeNonExisting({}, this.pbjsConfig, this.adserver.getPbjsConfig(), PREBID_DEFAULT_CONFIG);
      this.pbjs.setConfig(cfg);
    }
  }

}

export default AuctionBase;
