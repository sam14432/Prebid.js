/* eslint-disable */
import AuctionBase from './auctionBase';

const DEFAULT = {
  failsafeTimeout: 2000,
};

class PrebidAuction extends AuctionBase
{
  constructor(worker, params) {
    super(worker, params, DEFAULT);
  }

  init() {
    super.init();
    this.event('onInitPrebid');
    this.adserver.initPrebidAuction(this);
  }

}

export default PrebidAuction;
