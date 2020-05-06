import find from 'core-js/library/fn/array/find';
import {deepAccess, deepClone} from '../utils';

const MIN_VISIBILITY = 0.8;
const RELOAD_POLL_MS = 1000;
const WAIT_COMBINED_AUCTION_MS = 2000;

class ReloadState {
  constructor(settings) {
    Object.assign(this, settings, {
      lastRenderTs: null,
      renderCount: 0,
    });
  }

  onRender({ isEmpty }) {
    this.lastRenderTs = new Date();
    this.renderCount++;
    this.isIdle = true;
    if (!isEmpty && this.renderCount > 1) {
      const adDiv = this.getAdDiv();
      if (adDiv && adDiv.style && adDiv.style.display === 'none') {
        adDiv.style.display = '';
      }
    }
  }

  getAdDiv() {
    return this.reloader.adserver.getAdDivFromCode(this.code);
  }

  hasFinished() {
    return this.renderCount > this.times;
  }

  timeForNextRender() {
    if (!this.isIdle || this.hasFinished()) {
      return null;
    }
    return new Date(this.lastRenderTs.getTime() + (this.interval * 1000));
  }

  isVisible() {
    if (!this.minVisibility) {
      return true;
    }
    const div = this.getAdDiv();
    if (!div) {
      return false;
    }
    const defaultSz = (deepAccess(this.adUnit, 'mediaTypes.banner.sizes') || [])[0];
    if (!defaultSz) {
      return false;
    }
    const [width, height] = defaultSz;
    const { left, top } = div.getBoundingClientRect();
    const visibleWidth = Math.min(innerWidth, left + width) - Math.max(left, 0);
    const visibleHeight = Math.min(innerHeight, top + height) - Math.max(top, 0);
    return visibleWidth > 0 && visibleHeight > 0 && (visibleWidth * visibleHeight) > (width * height * MIN_VISIBILITY);
  }
};

class Reloader {
  constructor(worker, auction) {
    Object.assign(this, {
      adUnits: deepClone(auction.adUnits),
      worker,
      auction,
      adserver: auction.adserver,
      states: [],
      reCheckInterval: auction.reloadPollMs || RELOAD_POLL_MS,
    });
    this.adUnits.forEach((adUnit) => {
      if (!adUnit.reload && !adUnit.reloadAfter) {
        return;
      }
      const settings = {};
      ['reloadAfter', 'reloadTimes', 'reloadMinVisibility'].forEach((key) => {
        settings[key] = key in adUnit ? adUnit[key] : auction[key];
      });
      if (!settings.reloadAfter || !settings.reloadTimes) {
        return;
      }
      const minVisibility = settings.reloadMinVisibility === undefined ? MIN_VISIBILITY : settings.reloadMinVisibility || 0;
      this.states.push(new ReloadState({
        adUnit,
        code: adUnit.code,
        reloader: this,
        interval: settings.reloadAfter,
        times: settings.reloadTimes,
        minVisibility,
      }));
    });
    auction.adserver.registerListener((data) => {
      const state = this.getState(data.code);
      if (state) {
        state.onRender(data);
      }
    });
    this.runChecks();
  }

  runChecks() {
    this.runChecksInternal();
    if (find(this.states, (state) => !state.hasFinished())) {
      setTimeout(this.runChecks.bind(this), this.reCheckInterval);
    }
  }

  runChecksInternal() {
    if (!this.prebidIdle) {
      return;
    }
    const now = new Date();
    const soon = new Date() + WAIT_COMBINED_AUCTION_MS;
    const codes = [];
    for (let i = 0; i < this.states.length; i++) {
      const state = this.states[i];
      const nextTs = state.timeForNextRender();
      if (!nextTs || nextTs > soon || !state.isVisible()) {
        continue;
      }
      if (nextTs >= now) {
        return; // let's do it 'soon'
      }
      state.isIdle = false;
      codes.push(state.code);
    }
    if (codes.length) {
      this.auction.startPrebid(codes, true);
    }
  }

  getState(code) {
    return find(this.states, (state) => state.code === code);
  }

  onPrebidFinished(auction) {
    this.prebidIdle = true;
  }

  static needReloader(auction) {
    return !!find(auction.adUnits, (a) => a.reload || a.reloadAfter);
  }
}

export default Reloader;
