/* eslint-disable */
import * as utils from '../utils';

class WinSizeCalculator
{
  constructor(settings) {
    const DEFAULTS = {
      win: window,
      onDimensions: () => {},
      checkIvl: 500,
      duration: 5000,
    };
    Object.assign(this, DEFAULTS, settings || {});
    this.checksLeft = Math.floor(this.duration / this.checkIvl) + 1;
    this.reCheckFn = this.check.bind(this);
  }

  getDimensions() {
    const doc = this.win.document;
    return {
      width: doc.body.scrollWidth,
      height: doc.documentElement.offsetHeight,
    };
  }

  check() {
    if (this.stopped) {
      return;
    }
    const { width, height } = this.getDimensions();
    if (isNaN(width) || isNaN(height)) {
      utils.logWarn(`Failed getting dimensions width(${width}) height(${height})`);
    } else {
      if(width !== this.lastWidth || height !== this.lastHeight) {
        this.onDimensions(width, height);
      }
      this.lastWidth = width;
      this.lastHeight = height;
    }
    if (--this.checksLeft > 0) {
      setTimeout(this.reCheckFn, this.checkIvl);
    }
  }

  start() {
    if(this.win.document.readyState === 'complete') {
      this.check();
    } else {
      this.win.addEventListener('load', this.reCheckFn);
    }
  }

  stop() {
    this.stopped = true;
  }

}

export default WinSizeCalculator;
