/* eslint-disable */
import * as utils from '../utils';

const FillerStyle = {
  zIndex: '2147483647',
  position: 'absolute',
  maxWidth: '100%',
  maxHeight: '100%',
  pointerEvents: 'none',
  imageRendering: 'pixelated',
};

/** Terrible way to detect the empty "filler" element in google iframes */
const isFiller = (elm) => {
  if(elm.tagName !== 'DIV') {
    return false;
  }
  if(elm.children.length) {
    return false;
  }
  const { style } = elm;
  if(style.background.indexOf('image/png') < 0) {
    return false;
  }
  for(const key in FillerStyle) {
    if(style[key] !== FillerStyle[key]) {
      return false;
    }
  }
  return true;
}

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
    const MAX_SCAN_LEVEL = 0;
    const doc = this.win.document;
    const width = doc.body.scrollWidth;
    var height = doc.documentElement.offsetHeight;
    const scanHeight = (elm, level = 0) => {
      for(let i = 0; i < elm.children.length; i++) {
        const child = elm.children[i];
        const newHeight = child.scrollTop + child.offsetHeight;
        if(newHeight > height && !isFiller(child)) {
          height = newHeight;
        }
        if (level < MAX_SCAN_LEVEL) {
          scanHeight(child, level + 1);
        }
      }
    }
    if(!height && doc.body) {
      scanHeight(doc.body)
    }
    return { width, height };
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
