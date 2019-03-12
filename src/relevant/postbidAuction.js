/* eslint-disable */
import * as utils from '../utils';
import WinSizeCalculator from './winSizeCalculator';
import DfpAdserver from './dfpAdserver';

const setSize = (elm, width, height, useDisplayNone) => {
  const toDim = v => isNaN(v) ? v : v + "px";
  if (width != null) {
    elm.style.width = toDim(width);
  }
  if (height != null) {
    elm.style.height = toDim(height);
  }
  if (useDisplayNone && width != null && height != null) {
    if(!width || !height) {
      elm.style.display = 'none';
    } else if(elm.style.display === 'none') {
      elm.style.display = null;
    }
  }
};

const asElm = (win, elm) => {
  if (!elm) {
    return elm;
  }
  if (typeof elm === 'string' || elm instanceof String) {
    const res = win.document.querySelector(elm);
    if(!res) {
      throw Exception(`Failed to find element '${elm}'`);
    }
    return res;
  }
  return elm;
};

const PASSBACK_HTML = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset='UTF-8'/>
  </head>
  <body style='margin:0px; border:0px; padding:0px;'>
    <script>
        passback();
    </script>
  </body>
  </html>      
`;

class PostbidAuction
{
  constructor(worker, params) {
    // other values: bids, sizes, legacyPassbackHtml,
    // location { win, insertAfter, insertIn }
    const DEFAULT = {
      bidTimeOut: 1000,
      logIdentifier: 'unknown',
      containers: [],
      minHeight: 0,
      minWidth: 0,
      forcePassbackInIframe: false,
      adserver: 'dfp',
    };
    let pageConfig;
    try {
      pageConfig = top.RELEVANT_POSTBID_CONFIG;
    } catch(e) {}
    Object.assign(this, DEFAULT, pageConfig || {}, params, {
      worker,
      pbjs: worker.pbjs,
      unitId: `unit_${Math.random().toString().substring(2)}`,
    });
    if(Array.isArray(this.sizes) && Array.isArray(this.sizes[0])) {
      this.initWidth = this.sizes[0][0];
      this.initHeight = this.sizes[0][1];
    }
    if(!this.initWidth || !this.initHeight) {
      throw Error('sizes invalid');
    }
    this.adserver = worker.getAdserver(this.adserverType);
  }

  log(str) {
    utils.logInfo(`[${new Date().getTime() / 1000}]Postbid: ${this.logIdentifier} - ${str}`);
  }

  resize(width, height, ignoreMinDims) {
    if(!ignoreMinDims) {
      width = Math.max(width, this.minWidth);
      height = Math.max(height, this.minHeight);
    }
    this.log(`Setting width(${width}) height(${height})`);
    if (!this.hasResized) {
      (this.containers || []).forEach(c => setSize(c, 'auto', 'auto'));
      this.hasResized = true;
    }
    setSize(this.iframe, width, height, true);
    try { /** Check if there is a parent-iframe we should try to resize */
      const { frameElement } = this.location.win;
      if (frameElement) {
        setSize(frameElement, width, height, true)
      }
    } catch(e) { /** In un-friendly iframe */ }
  }

  initIframe() {
    let { win, insertAfter, appendTo } = this.location || {};
    if (!win) {
      throw Error('location.win not defined');
    }
    const noSpec = !insertAfter && !appendTo;
    const doc = win.document;
    if (win === top) {
      if(noSpec) {
        throw Error('Need to specify where to insert iframe if in top window');
      }
    }
    if (noSpec) {
      if (!doc.body) {
        throw Error(`document.body missing`);
      }
      appendTo = doc.body;
    }

    var iframe = doc.createElement('iframe');
    const attribs = {
      FRAMEBORDER: 0,
      SCROLLING: 'no',
      MARGINHEIGHT: 0,
      MARGINWIDTH: 0,
      TOPMARGIN: 0,
      LEFTMARGIN: 0,
      ALLOWTRANSPARENCY: 'true',
      ALLOWFULLSCREEN: 'true',
      ALLOW: 'autoplay',
      width: this.initWidth,
      height: this.initHeight,
    };
    for (const [key, value] of Object.entries(attribs)) {
      iframe.setAttribute(key, value);
    }
    iframe.style.display = 'none';
    insertAfter = asElm(win, insertAfter);
    appendTo = asElm(win, appendTo);
    if (insertAfter) {
      insertAfter.parentNode.insertBefore(iframe, insertAfter.nextSibling);
    } else if (appendTo) {
      appendTo.appendChild(iframe);
    }
    this.iframe = iframe;
  }

  init() {
    this.log('Init postbid');
    this.adserver.initPostbidAuction(this);
    this.initIframe();
  }

  getPrebidElement() {
    return {
      code: this.unitId,
      sizes: this.sizes,
      bids: this.bids,
    };
  }

  requestBids() {
    pbjs.addAdUnits([{
      code: this.unitId,
      sizes: this.sizes,
      bids: this.bids,
    }]);
    pbjs.requestBids({
      adUnitCodes: [this.unitId],
      timeout: this.bidTimeOut,
      bidsBackHandler: () => this.onBidsBack(),
    });
  }

  static onRenderCallsDone(results) {
    const withGptPassback = results.filter(r => r.result.type === 'google') || {};
    if(withGptPassback.length) {
      const { auction, result } = withGptPassback[0];
      const { googletag } = result;
      if (!(auction.adserver instanceof DfpAdserver) && !googletag.pubadsReady) {
        googletag.pubads().collapseEmptyDivs();
        googletag.pubads().enableSingleRequest();
        googletag.enableServices();
      }
      withGptPassback.forEach(({ auction }) => googletag.display(auction.gptDivId));
    }
  }

  static requestMultipleBids(auctions) {
    const byTimeout = {};
    auctions.forEach((auction) => {
      const key = `${auction.bidTimeOut}_${auction.adserverType}`;
      (byTimeout[key] = byTimeout[key] || []).push(auction);
    });
    for (const key in byTimeout) {
      const arr = byTimeout[key];
      const results = [];
      const adUnits = arr.map(auction => auction.getPrebidElement());
      const pbjs = arr[0].pbjs;
      pbjs.que.push(() => {
        pbjs.addAdUnits(adUnits);
        pbjs.requestBids({
          adUnitCodes: adUnits.map(unit => unit.code),
          timeout: arr[0].bidTimeOut,
          bidsBackHandler: () => arr.forEach(auction => auction.onBidsBack((result) => {
            results.push({ result, auction });
            if (results.length === arr.length) {
              PostbidAuction.onRenderCallsDone(results);
            }
          })),
        });
      });
    }
  }

  onGooglePassbackRendered(ev) {
    if(ev.slot.getSlotElementId() !== this.gptDivId) {
      return;
    }
    if(ev.isEmpty) {
      setSize(this.gptDiv, Math.max(0, this.minWidth), Math.max(0, this.minHeight));
      if(!this.passbackRunInTop) {
        this.resize(0, 0);
      }
      return;
    }
    const ifr = this.gptDiv.getElementsByTagName("iframe")[0];
    if(!ifr) {
      this.log("Failed to find passback iframe");
      return;
    }
    setSize(this.gptDiv, 'auto', 'auto');
    let childIframe;
    if(this.passbackRunInTop) {
      this.iframe = ifr;
      this.location = { win: top };
      let node = ifr;
      do {
        node = node.parentNode;
        node.style.setProperty('margin', '0px', 'important');
      } while (node !== this.gptDiv);
    } else {
      childIframe = ifr;
      this.startResizer(childIframe);
    }
  }

  createGptDiv(doc, withContainer) {
    const elm = doc.createElement('div');
    let gptTarget = elm;
    if(withContainer) {
      gptTarget = doc.createElement('div');
      elm.appendChild(gptTarget);
    }
    gptTarget.setAttribute('id', this.gptDivId);
    //setSize(elm, this.initWidth, this.initHeight);
    return elm;
  };

  showIframe() {
    this.iframe.style.display = null;
  }

  initGooglePassbackUnit(onRenderTriggered) {
    const { googlePassbackUnit, initWidth, initHeight, sizes, adserver } = this;
    this.gptDivId = `div-gpt-id-${Math.random().toString().substring(2)}-0`;
    let adContainer, googletag;
    try {
      if(top.checkingCrossDomain) {
        console.info();
      }
      if(this.location.win === top) {
        adContainer = adserver.getAdContainer(this.iframe);
      } else {
        const { frameElement } = this.location.win
        const ownerDoc = (frameElement || {}).ownerDocument || {};
        if((ownerDoc.defaultView || ownerDoc.parentWindow) === top) {
          adContainer = adserver.getAdContainer(frameElement);
        }
      }
      if(adContainer && top.googletag) {
        googletag = top.googletag;
      }
    } catch(e) {}
    this.passbackRunInTop = !!(!this.forcePassbackInIframe && adContainer && googletag/* && this.location.win !== top*/);
    if(this.passbackRunInTop) { // re-use
      this.gptDiv = adserver.createGptPassbackDiv(this, adContainer);
      this.resize(0, 0, true);
    } else {
      const win = this.iframe.contentWindow;
      const doc = win.document;
      const script = doc.createElement('script');
      this.gptDiv = this.createGptDiv(top.document, false);
      googletag = win.googletag = { cmd: [] };
      doc.body.appendChild(this.gptDiv);
      script.src = 'https://www.googletagservices.com/tag/js/gpt.js';
      doc.head.appendChild(script);
      this.showIframe();
    }
    googletag.cmd.push(() => {
      googletag.pubads().addEventListener('slotRenderEnded', ev => this.onGooglePassbackRendered(ev));
      googletag.defineSlot(googlePassbackUnit, sizes, this.gptDivId).addService(googletag.pubads());
      onRenderTriggered({ type: 'google', googletag });
    });
  }

  startResizer(childIframe) {
    const szCalc = new WinSizeCalculator({
      win: (childIframe || this.iframe).contentWindow,
      onDimensions: (width, height, ifr) => {
        this.resize(width, height);
        if(childIframe && ifr === childIframe) {
          setSize(childIframe, width, height);
        }
      },
      checkIvl: this.sizeCheckIvl || 500,
      duration: this.sizeCheckDuration || 5000,
    });
    szCalc.start();
  }

  onBidsBack(onRenderTriggered) {
    const ifrDoc = this.iframe.contentWindow.document;
    var params = this.pbjs.getAdserverTargetingForAdUnitCode(this.unitId);
    if (params && params.hb_adid) {
      this.log(`Bid won - rendering ad: ${params}`);
      const dimensions = (params.hb_size || '').split('x');
      if(dimensions.length === 2) {
        this.resize(dimensions[0], dimensions[1]);
      }
      this.showIframe();
      this.pbjs.renderAd(ifrDoc, params.hb_adid);
      onRenderTriggered({ type: 'prebid' });
    } else {
      this.log('Calling passback');
      ifrDoc.open('text/html', 'replace');
      this.iframe.contentWindow.passback = () => {
        if(this.googlePassbackUnit) {
          this.initGooglePassbackUnit(onRenderTriggered);
        } else {
          this.showIframe();
          ifrDoc.write(eval("'" + (this.legacyPassbackHtml || '') + "'"));
          onRenderTriggered({ type: 'legacy' });
          this.startResizer();
        }
      };
      ifrDoc.write(PASSBACK_HTML);
      ifrDoc.close();
    }
  }
}

export default PostbidAuction;
