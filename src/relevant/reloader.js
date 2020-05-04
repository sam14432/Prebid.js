import find from 'core-js/library/fn/array/find';

class ReloadState {
    constructor(settings) {
      Object.assign(this, settings, {
        lastRenderTs: null,
        renderCount: 0,
      });
    }
};

class Reloader {
  constructor(worker, auction) {
    Object.assign(this, {
      worker,
      auction,
      reloadAuctions,
      states: [],
    });
    this.adUnits.forEach((adUnit) => {
      if (!adUnit.reload) {
        return;
      }
      const reloadAfter = 'reloadAfter' in adUnit ? adUnit.reloadAfter : auction.reloadAfter;
      const reloadTimes = 'reloadTimes' in adUnit ? adUnit.reloadTimes : auction.reloadTimes;
      if (!reloadAfter || !reloadTimes) {
        return;
      }
      states.push(new ReloadState({
        code: adUnit.code,
        reloader: this,
        interval: reloadAfter,
        times: reloadTimes,
      }));
    });
    auction.adserver.registerListener((data) => {
      const state = getState(data.code);
      if (state) {
        state.onRender(data);
        this.runChecks();
      }
    });
  }

  runChecks() {
    
  }

  getState(code) {
    return find(this.states, (state) => state.code === code);
  }

  onPrebidFinished(auction) {
    runChecks();
  }

  static needReloader(auction) {
    return !!find(auction.adUnits, (a) => a.reload || a.reloadAfter);
  }
}

export default Reloader;
