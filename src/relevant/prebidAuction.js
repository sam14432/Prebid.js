/* eslint-disable */

class PrebidAuction
{
  constructor(worker, params) {
    this.adserver = worker.getAdserver(this.adserverType);
  }

  log(str) {
    this.worker.constructor.log(`Prebid: ${str}`);
  }

}

export default PrebidAuction;
