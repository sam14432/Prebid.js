/* eslint-disable */
import * as utils from 'src/utils';

const setSize = (elm, width, height) => {
  const toDim = v => isNaN(v) ? v : v + "px";
  if (width != null) {
    elm.style.width = toDim(width);
  }
  if (height != null) {
    elm.style.height = toDim(width);
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
    // other values: bids, sizes, legacyPassbackHtml, IframeResizerMinHeight
    // location { win, insertAfter, insertIn }
    const DEFAULT = {
      bidTimeOut: 1000,
      logIdentifier: 'unknown',
      containers: [],
    };
    Object.assign(this, DEFAULT, params, {
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
  }

  log(str) {
    utils.logInfo(`Postbid: ${this.logIdentifier} - ${str}`);
  }

  resize(width, height) {
    if (!this.hasResized) {
      (this.containers || []).forEach(c => setSize(c, 'auto', 'auto'));
      this.hasResized = true;
    }
    try {
      if (this.win.frameElement) {
        setSize(this.win.frameElement, width, height)
      }
    } catch(e) { /** In un-friendly iframe */ }
    setSize(this.iframe, width, height);
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
    if(noSpec) {
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
      width: this.initWidth,
      height: this.initHeight,
    };
    for (const [key, value] of Object.entries(attribs)) {
      iframe.setAttribute(key, value);
    }
    insertAfter = asElm(win, insertAfter);
    appendTo = asElm(win, insertAfter);
    if (insertAfter) {
      insertAfter.parentNode.insertBefore(iframe, insertAfter.nextSibling);
    } else if (appendTo) {
      appendTo.appendChild(iframe);
    }
    this.iframe = iframe;
  }

  run() {
    this.initIframe();
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

  onBidsBack() {
    var params = this.pbjs.getAdserverTargetingForAdUnitCode(this.unitId);
    if (params && params.hb_adid) {
      this.log(`Bid won - rendering ad: ${params}`);
      const dimensions = (params.hb_size || '').split('x');
      if(dimensions.length === 2) {
        this.setSize(dimensions[0], dimensions[1]);
      }
      this.pbjs.renderAd(iframeDoc, params.hb_adid);
    } else {
      this.log('Calling passback');
      const ifrDoc = this.iframe.contentWindow.document;
      ifrDoc.open();
      this.iframe.contentWindow.passback = () => {
        let { passbackHtml } = this;
        if (!passbackHtml && this.legacyPassbackHtml) {
          passbackHtml = eval("'" + this.legacyPassbackHtml + "'");
        }
        ifrDoc.write(passbackHtml || '');
      };
      ifrDoc.write(PASSBACK_HTML);
      ifrDoc.close();
    }
  }
}

class RelevantWorker
{
  constructor(preQueue, pbjs) {
    this.queue = preQueue || [];
    this.pbjs = pbjs;
  }

  init() {
    this.pbjs.setConfig({
      consentManagement: {},
      debug: location.toString().indexOf('relevant-debug'),
    });
    this.queue.forEach(param => this.runCmd(param));
  }

  runCmd(param) {
    const CMDS = {
      postbid: param => this.doPostbid(param),
    };
    //try {
      if(!param || !CMDS[param.cmd]) {
        throw `Invalid parameter: ${(param || {}).cmd}`;
      }
      CMDS[param.cmd](param.param);
    /*} catch(e) {
      utils.logError(`Command error: ${e.message}`);
      if(param.onError) {
        try {
          param.onError(e);
        } catch(e) {
          utils.logError(`Error in error handler: ${e.message}`);
        }
      }
    }*/
  }

  doPostbid(param) {
    const postbid = new PostbidAuction(this, param);
    postbid.run();
  }

  push(param) {
    this.runCmd(param);
  }
};

var pbjs = window.pbjs || {};
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  window.relevantQueue = new RelevantWorker(window.relevantQueue, pbjs);
  window.relevantQueue.init();
});


