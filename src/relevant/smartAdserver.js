import AdserverBase from './adserverBase';
import SmartSkipper from './smartSkipper';
import { injectCall } from './utils';

const isAdUnitCode = (str) => {
  if (!str || str.length > 100) {
    return false;
  }
  var FORBIDDEN = '<> ';
  for (var i = 0; i < FORBIDDEN.length; i++) {
    if (str.indexOf(FORBIDDEN[i]) >= 0) {
      return false;
    }
  }
  return true;
};

const toParts = s => (s || '').toString().split(',').filter(s => s);

const extractAdUnitCode = (str) => {
  const match = /defineSlot\s?\(\s?["'](.*?)["']/.exec(str);
  return (match || [])[1];
};

const getFormatsAndTags = (sasCallParams) => {
  const { formats, formatId, tagId } = sasCallParams;
  if (formats) {
    return formats.map(f => ({ id: f.id, tagId: f.tagId ? f.tagId : `sas_${f.id}` }));
  }
  const tagParts = toParts(tagId);
  return toParts(formatId).map((s, i) => ({ id: s, tagId: tagParts[i] || `sas_${s}` }));
};

const toPostParam = (param) => {
  if (param.formats) {
    return param; // already on POST format
  }
  const tagIds = toParts(param.tagId);
  const newParam = Object.assign({}, param, {
    formats: toParts(param.formatId).map((s, i) => {
      const obj = { id: parseInt(s.trim()) };
      const tagId = tagIds[i];
      if (tagId) {
        obj.tagId = tagId;
      }
      return obj;
    }),
  });
  delete newParam.formatId;
  delete newParam.tagId;
  return newParam;
};

const DEFAULTS = {
  injectSmartCalls: true,
  sasOnlyUseRendered: false,
  skipSmartAdserver: false,
};

class SmartAdserver extends AdserverBase {
  constructor(worker) {
    super(worker);
    this.calledFormats = [];
  }

  getAdserverDefaults() {
    return DEFAULTS;
  }

  getDefaultAdUnitId(auction) {
    return this.getAdUnitCodeFromParams(auction, auction);
  }

  createGptPassbackDiv(auction, adContainer, dimensions) {
    const gptDiv = auction.createGptDiv(top.document, { width: '100%', height: '100%' }); // ignore dimensions, start collapsed
    adContainer.appendChild(gptDiv);
    return gptDiv;
  }

  initPostbidAuction(auction) {
    const { legacyPassbackHtml, googlePassbackUnit } = auction;
    if (!googlePassbackUnit && legacyPassbackHtml) {
      let adUnitCode;
      if (isAdUnitCode(legacyPassbackHtml)) {
        adUnitCode = `${auction.adunitPathPrepend || ''}${auction.legacyPassbackHtml}`;
      } else {
        adUnitCode = extractAdUnitCode(legacyPassbackHtml);
      }
      if (adUnitCode) {
        auction.googlePassbackUnit = adUnitCode;
        auction.legacyPassbackHtml = null;
      }
    }
    super.initPostbidAuction(auction);
  }

  setupOptions(auction, options) {
    const newOptions = Object.assign({}, options);
    const { onNoad, onLoad } = newOptions; // old callbacks
    newOptions.onLoad = (param, ...rest) => {
      if (onLoad) {
        const newLoadParams = Object.assign({}, param);
        if (auction.unitsByCode && auction.unitsByCode[param.tagId]) {
          newLoadParams.hasAd = true;
        }
        onLoad(newLoadParams, ...rest);
      }
    };
    newOptions.onNoad = (param, ...rest) => {
      const triggerNoad = () => (onNoad ? onNoad.call(options, param, ...rest) : null);
      const renderParams = {
        tagId: param.tagId,
        events: {
          onAdResponse: ({ noAd }) => {
            if (noAd) {
              triggerNoad();
            }
          },
        },
      };
      const rendered = auction.renderUsingParams(renderParams);
      if (!rendered) {
        triggerNoad();
      }
    };
    return newOptions;
  }

  injectSmartCall() {
    if (SmartAdserver.sasInjected) {
      return;
    }
    SmartAdserver.sasInjected = true;
    const auction = () => this.worker.prebid;
    const { smartSkipper } = this.worker;
    injectCall(sas, 'setup', (sasSetup, param, ...rest) => {
      const newParam = Object.assign({}, param, { renderMode: 2 });
      if (smartSkipper) {
        smartSkipper.setupSetupParams(newParam);
      }
      return sasSetup(newParam, ...rest);
    });
    injectCall(sas, 'call', (sasCall, type, param, options, ...rest) => {
      let newParam = param;
      if (type === 'onecall') {
        newParam = toPostParam(param);
      }
      const newOptions = this.setupOptions(auction(), options);
      this.calledFormats.push(...getFormatsAndTags(newParam));
      if (!auction().sasOnlyUseRendered) {
        auction().startPrebid(this.calledFormats.map(f => f.tagId));
      }
      if (smartSkipper) {
        smartSkipper.setupCallParams(newParam, newOptions);
      }
      return sasCall.call(sas, type, newParam, newOptions, ...rest);
    });
    if (auction().sasOnlyUseRendered || smartSkipper) {
      injectCall(sas, 'render', (sasRender, fmtId, ...rest) => {
        auction().log('Render: ' + fmtId);
        if (fmtId) {
          if (!this.renderSeen) {
            this.renderSeen = {};
            if (auction().sasOnlyUseRendered) {
              setTimeout(() => {
                auction().startPrebid(this.calledFormats.filter(f => this.renderSeen[f.id]).map(f => f.tagId));
              });
            }
          }
          this.renderSeen[fmtId] = true;
        }
        if (smartSkipper && smartSkipper.skipHandleRender(fmtId)) {
          return;
        }
        return fmtId === undefined ? sasRender.call(sas) : sasRender.call(sas, fmtId, ...rest);
      });
    }
  }

  initPrebidAuction(auction) {
    window.sas = window.sas || {};
    sas.cmd = sas.cmd || [];
    if (auction.skipSmartAdserver && !this.worker.smartSkipper) {
      this.worker.smartSkipper = new SmartSkipper(this.worker);
    }
    if (!('injectSmartCalls' in auction) || auction.injectSmartCalls) { // inject by default..
      this.injectSmartCall(auction);
    }
  }

  getAdUnitCodeFromParams(auction, param) {
    if (param.tagId) {
      return param.tagId;
    }
    const sasDiv = (param.containers || [])[0];
    if (!sasDiv) {
      return null;
    }
    return sasDiv.getAttribute('id');
  }

  getPostPrebidParams(auction, adUnit, postbidParams, newParams) {
    const sasDiv = document.getElementById(adUnit.code);
    if (!sasDiv) {
      return null;
    }
    const res = {
      location: { win: window, appendTo: sasDiv },
      containers: [sasDiv],
    };
    if (!('googlePassbackUnit' in adUnit) && postbidParams) { // copy passback
      res.legacyPassbackHtml = postbidParams.legacyPassbackHtml;
      res.googlePassbackUnit = postbidParams.googlePassbackUnit;
    }
    return res;
  }

  sendAdserverRequest(auction, { isReload, adUnits }) {
    sas.cmd.push(() => {
      const units = adUnits || auction.adUnits;
      units.forEach((adUnit) => {
        const bid = auction.pbjs.getHighestCpmBids(adUnit.code)[0];
        if (bid) {
          sas.setHeaderBiddingWinner(adUnit.code, bid);
        }
      });
      if (isReload) {
        units.forEach((unit) => {
          sas.refresh(unit.code);
        });
      } else {
        sas.render();
      }
    });
  }

  registerListener(cb) {
    const handle = (isEmpty, { tagId }) => {
      cb({ isEmpty, code: tagId });
    };
    sas.cmd.push(() => {
      sas.events.history().forEach(({ eventName, data }) => {
        if (eventName === 'ad') {
          handle(false, data);
        } else if (eventName === 'noad') {
          handle(true, data);
        }
      });
      sas.events.on('ad', (param) => handle(false, param));
      sas.events.on('noad', (param) => handle(true, param));
    });
  }
}

export default SmartAdserver;
