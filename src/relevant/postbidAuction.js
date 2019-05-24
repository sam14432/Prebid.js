/* eslint-disable */
import * as utils from '../utils';
import WinSizeCalculator from './winSizeCalculator';
import DfpAdserver from './dfpAdserver';
import Hacks from './hacks';
import AuctionBase from './auctionBase';
import { setSize, createIframe, isIframeAccessible, isWindowAccessible ,asElm } from './utils';

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

// other values: bids, sizes, legacyPassbackHtml,
// location { win, insertAfter, appendTo }
const DEFAULT = {
  bidTimeOut: 1000,
  logIdentifier: 'unknown',
  containers: [],
  minHeight: 0,
  minWidth: 0,
  forcePassbackInIframe: false,
  forceGptInIframe: false,
  disableGptSingleRequest: false,
  existingLegacyIframe: null,
  adserverType: 'dfp',
  googleCollapseEmptyDivStyle: 'full', // 'full', 'post', else none
  trickSasPassbackIntoIframe: false,
  hidePassbackUntilFinished: false,
};

class PostbidAuction extends AuctionBase
{
  constructor(worker, params) {
    super(worker, params, DEFAULT);
    if(Array.isArray(this.sizes) && Array.isArray(this.sizes[0])) {
      this.initWidth = this.sizes[0][0];
      this.initHeight = this.sizes[0][1];
    }
    if(!this.initWidth || !this.initHeight) {
      throw Error('sizes invalid');
    }
    if(this.existingLegacyIframe) {
      this.iframe = this.existingLegacyIframe;
    }
    if (!this.unitId) {
      this.unitId = this.adserver.getDefaultAdUnitId(this) || `unit_${Math.random().toString().substring(2)}`;
    }
  }

  auctionType() { return this.isPostPrebid ? 'post_prebid' : 'postbid' }

  resize(width, height, ignoreMinDims) {
    if(!ignoreMinDims) {
      width = Math.max(width, this.minWidth);
      height = Math.max(height, this.minHeight);
    }
    //this.log(`Setting width(${width}) height(${height})`);
    if (!this.hasResized) {
      //(this.containers || []).forEach(c => setSize(c, 'auto', 'auto')); //Why did I have this..?
      this.hasResized = true;
    }
    setSize(this.iframe, width, height, true);
    try { /** Check if there is a parent-iframe we should try to resize */
      let { frameElement } = this.location.win;
      if(!frameElement && this.existingLegacyIframe) { // old postbid template fix/hack
        const parentDoc = this.existingLegacyIframe.ownerDocument;
        if(parentDoc) {
          const parentWin = parentDoc.defaultView || parentDoc.parentWindow;
          if(parentWin && parentWin.frameElement) {
            frameElement = parentWin.frameElement;
          }
        }
      }
      if (frameElement) {
        setSize(frameElement, width, height, true)
      }
    } catch(e) { /** In un-friendly iframe */ }
  }

  refreshLocation() {
    ['appendTo', 'inserAfter'].forEach((name) => {
      const old = this.location[name];
      if(!old) {
        return;
      }
      let elm = asElm(this.location.win, old);
      if(elm === old) {
        const id = old.getAttribute('id');
        if(id) {
          const withSameId = this.location.win.document.getElementById(id);
          if(withSameId) {
            elm = withSameId;
          }
        }
      }
      this.location[name] = elm;
    });
  }

  initIframe() {
    this.iframe = createIframe(this.location, this.initWidth, this.initHeight, this.iframeId ? { id: this.iframeId } : null, { display: 'none' });
  }

  init() {
    super.init();
    this.adserver.initPostbidAuction(this);
    this.event('onInitPostbid');
    if(!this.iframe) {
      this.initIframe();
    }
  }

  getPrebidElement() {
    return {
      code: this.unitId,
      sizes: this.sizes,
      bids: this.bids,
    };
  }

  static onRenderCallsDone(results) {
    const withGptPassback = results.filter(r => r.result.type === 'google') || {};
    if(!withGptPassback.length) {
      return;
    }
    const initializedGoogleTags = [];
    withGptPassback.forEach(({ auction, result }) => {
      const { googletag } = result;
      if (!(auction.adserver instanceof DfpAdserver) && !googletag.pubadsReady && initializedGoogleTags.indexOf(googletag) < 0) {
        const collapseStyle = auction.googleCollapseEmptyDivStyle;
        if (collapseStyle === 'full') {
          googletag.pubads().collapseEmptyDivs(true);
        } else if(collapseStyle === 'post') {
          googletag.pubads().collapseEmptyDivs();
        }
        if(!auction.forceGptInIframe && !auction.disableGptSingleRequest) {
          googletag.pubads().enableSingleRequest();
        }
        googletag.enableServices();
        this.event('onGoogletagInit', { googletag });
        initializedGoogleTags.push(googletag);
      }
      auction.log('calling googletag.display()');
      googletag.display(auction.gptDiv.children[0]);
    });
  }

  static requestMultipleBids(auctions) {
    const byTimeout = {};
    auctions.forEach((auction) => {
      const key = `${auction.bidTimeOut}_${auction.adserverType}_${!!auction.isPostPrebid}`;
      (byTimeout[key] = byTimeout[key] || []).push(auction);
    });
    for (const key in byTimeout) {
      const arr = byTimeout[key];
      const results = [];
      const adUnits = arr.map(auction => auction.getPrebidElement());
      const pbjs = arr[0].pbjs;

      const callBidsBack = () => arr.forEach(auction => auction.onBidsBack((result) => {
        results.push({ result, auction });
        if (results.length === arr.length) {
          PostbidAuction.onRenderCallsDone(results);
        }
      }));
      if(arr[0].isPostPrebid) {
        callBidsBack();
      } else {
        pbjs.que.push(() => {
          pbjs.addAdUnits(adUnits);
          pbjs.requestBids({
            adUnitCodes: adUnits.map(unit => unit.code),
            timeout: arr[0].bidTimeOut,
            bidsBackHandler: callBidsBack,
          });
        });
      }
    }
  }

  onAdResponse(params) {
    this.currentAd = params;
    const { width, height, type, noAd } = params;
    this.log(`Ad response: ${noAd ? 'EMPTY' : `${width}x${height} (${type === 'prebid' ? params.prebidParams.hb_bidder || 'prebid' : type})`}`);
    this.event('onAdDimensions', { width, height, isOnAdResponse: true });
  }

  onAdDimensionsChanged(params) {
    this.event('onAdDimensions', params);
  }

  onPassbackEmpty(responseParams, ifr) {
    setSize(this.gptDiv, Math.max(0, this.minWidth), Math.max(0, this.minHeight));
    if(!this.passbackRunInTop) {
      this.resize(0, 0);
      setSize(this.gptDiv, 0, 0);
    }
    if(ifr) {
      ifr.style.display = 'none';
    }
    this.event('onAdResponse', Object.assign({ noAd: true, width: 0, height: 0 }, responseParams));
  }

  onPassbackHasAd(responseParams, ifr, width, height, useIframeResizerIfSet) {
    setSize(this.gptDiv, 'auto', 'auto');
    if(this.passbackRunInTop) {
      if(this.hidePassbackUntilFinished) {
        this.gptDiv.style.display = '';
      }
      this.iframe = ifr;
      this.location = { win: top };
      let node = ifr;
      do {
        node = node.parentNode;
        node.style.setProperty('margin', '0px', 'important');
      } while (node !== this.gptDiv);
    } else {
      if(this.hidePassbackUntilFinished) {
        this.showIframe();
      }
      this.resize(width, height);
    }
    this.event('onAdResponse', Object.assign({ width, height }, responseParams));
    if (useIframeResizerIfSet && this.useIframeResizer) {
      this.startResizer(ifr);
    }
  }

  /** All of this is because of some stupid AdX bug that might return too-large ads */
  prepareGoogleDimensions(ev) {
    const [ width, height ] = ev.size;
    const dims = this.googleDimensions || this.sizes;
    let maxAllowedWidth = 0;
    dims.forEach(([width]) => {
      maxAllowedWidth = Math.max(maxAllowedWidth, width);
    });
    if(width <= maxAllowedWidth) {
      return { width, height };
    }
    const scale = maxAllowedWidth / width;
    Object.assign(this.gptDiv.style, {
      transformOrigin: 'left top',
      transform: `scale(${scale})`,
    });
    const res = {
      width: maxAllowedWidth,
      height: Math.round(scale * height),
    };
    this.log(`Rescaling invalid dimensions ${width}x${height} to ${res.width}x${res.height}`);
    return res;
  }

  onGooglePassbackRendered(ev) {
    if(ev.slot.getSlotElementId() !== this.gptDivId) {
      return;
    }
    if(ev.isEmpty) {
      this.onPassbackEmpty({ type: 'google', googleParams: ev });
      return;
    }

    const ifr = this.gptDiv.getElementsByTagName("iframe")[0];
    if(!ifr) {
      this.log("Failed to find passback iframe");
      return;
    }

    let { width, height } = this.prepareGoogleDimensions(ev);

    // Check Smart passback
    if(isIframeAccessible(ifr) && ifr.contentWindow.sas && ifr.contentWindow.sas.cmd) {
      const { sas } = ifr.contentWindow;
      if(this.trickSasPassbackIntoIframe) {
        ifr.contentWindow.inDapIF = false;
      }
      let noad = false;
      const onNoad = () => {
        noad = true;
        this.onPassbackEmpty({ type: 'smart', googleParams: ev }, ifr);
      };
      const onLoad = (data) => {
        if(!noad) {
          this.onPassbackHasAd({ type: 'smart', googleParams: ev, smartParams: data }, ifr, width, height, true);
        }
      }
      sas.cmd.push(() => {
        sas.events.on('noad', onNoad);
        sas.events.on('load', onLoad);
        sas.events.history().forEach(({ eventName, data }) => {
          if(eventName === 'load') {
            onLoad(data);
          } else if(eventName === 'noad') {
            onNoad();
          }
        });
      });
    } else {
      this.onPassbackHasAd({ type: 'google', googleParams: ev }, ifr, width, height, false);
    }
  }

  createGptDiv(doc, dimensions) {
    const elm = doc.createElement('div');
    //elm.style.display = 'inline-block'; // make div more "iframe-like", needed on newz.dk
    const gptTarget = doc.createElement('div');
    elm.appendChild(gptTarget);
    gptTarget.setAttribute('id', this.gptDivId);
    if(dimensions) {
      setSize(elm, dimensions.width, dimensions.height);
    }
    return elm;
  };

  showIframe() {
    this.iframe.style.display = '';
  }

  initGooglePassbackInfo() {
    const { adserver } = this;
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
    return { adContainer, googletag };
  }

  initGooglePassbackUnit(onRenderTriggered, googlePassbackSettings) {
    let { googletag } = googlePassbackSettings;
    const { googlePassbackUnit, initWidth, initHeight, sizes, googleDimensions, adserver, hidePassbackUntilFinished } = this;
    this.gptDivId = `div-gpt-id-${Math.random().toString().substring(2)}-0`;
    if(this.passbackRunInTop) { // re-use
      const { adContainer } = googlePassbackSettings;
      this.gptDiv = adserver.createGptPassbackDiv(this, adContainer, {
        width: adContainer.clientWidth,
        height: adContainer.clientHeight,
      });
      if(hidePassbackUntilFinished) {
        this.gptDiv.style.display = 'none';
      }
      this.resize(0, 0, true);
    } else {
      const win = this.iframe.contentWindow;
      const doc = win.document;
      const script = doc.createElement('script');
      this.gptDiv = this.createGptDiv(doc, { width: '100%', height: '100%' });
      doc.body.appendChild(this.gptDiv);
      if (isWindowAccessible(top) && top.googletag && !this.forceGptInIframe) {
        googletag = top.googletag;
      } else {
        googletag = win.googletag = {cmd: []};
        script.src = 'https://www.googletagservices.com/tag/js/gpt.js';
        doc.head.appendChild(script);
      }
      if(!hidePassbackUntilFinished) {
        this.showIframe();
      }
    }
    googletag.cmd.push(() => {
      //googletag.openConsole();
      googletag.pubads().addEventListener('slotRenderEnded', ev => this.onGooglePassbackRendered(ev));
      googletag.defineSlot(googlePassbackUnit, googleDimensions || sizes, this.gptDivId).addService(googletag.pubads());
      onRenderTriggered({ type: 'google', googletag });
    });
  }

  startResizer(childIframe) {
    if(!isIframeAccessible(childIframe)) {
       return; // cross-domain iframe (perhaps a safe-frame), ignore
    }
    const szCalc = new WinSizeCalculator({
      win: (childIframe || this.iframe).contentWindow,
      onDimensions: (width, height, ifr) => {
        if ((this.iframe.style || {}).position === 'absolute') {
          return; // Special case for Smart Default banner passbacks that moves out of iframe, let's just skip this
        }
        this.resize(width, height);
        this.event('onAdDimensionsChanged', { width, height });
        if(childIframe && ifr === childIframe) {
          setSize(childIframe, width, height);
        }
      },
      checkIvl: this.sizeCheckIvl,
      duration: this.sizeCheckDuration,
      lastWidth: this.currentAd.width,
      lastHeight: this.currentAd.height,
    });
    szCalc.start();
  }

  onBidsBack(onRenderTriggered) {
    if(!this.iframe.contentWindow) {
      this.refreshLocation();
      this.initIframe();
      if(!this.iframe.contentWindow) {
        throw Error('Iframe error');
      }
    }
    const ifrDoc = this.iframe.contentWindow.document;
    var params = this.pbjs.getAdserverTargetingForAdUnitCode(this.unitId);
    let width = this.initWidth;
    let height = this.initHeight;
    if (params && params.hb_adid) {
      const dimensions = (params.hb_size || '').split('x');
      if(dimensions.length === 2) {
        width = parseInt(dimensions[0]);
        height = parseInt(dimensions[1]);
        this.resize(width, height);
      }
      this.showIframe();
      this.pbjs.renderAd(ifrDoc, params.hb_adid);
      this.event('onAdResponse', { type: 'prebid', prebidParams: params, width, height });
      onRenderTriggered({ type: 'prebid' });
    } else {
      this.log('Calling passback');
      let googlePassbackSettings;
      if (this.googlePassbackUnit) {
        googlePassbackSettings = this.initGooglePassbackInfo();
        if(this.passbackRunInTop) {
          this.initGooglePassbackUnit(onRenderTriggered, googlePassbackSettings);
          return; // no need to write into iframe
        }
      }
      ifrDoc.open('text/html', 'replace');
      this.iframe.contentWindow.passback = () => {
        if(this.googlePassbackUnit) {
          this.initGooglePassbackUnit(onRenderTriggered, googlePassbackSettings);
        } else if (this.legacyPassbackHtml) {
          this.showIframe();
          ifrDoc.write(eval("'" + (this.legacyPassbackHtml || '') + "'"));
          this.event('onAdResponse', { type: 'legacy', width, height });
          onRenderTriggered({ type: 'legacy' });
          this.startResizer();
        } else {
          this.event('onAdResponse', { type: 'prebid', noAd: true, width: 0, height: 0 });
          onRenderTriggered({ type: 'none' });
        }
      };
      ifrDoc.write(PASSBACK_HTML);
      ifrDoc.close();
    }
  }
}

export default PostbidAuction;
