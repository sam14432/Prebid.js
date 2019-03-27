import AdserverBase from './adserverBase';
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

const extractAdUnitCode = (str) => {
  const match = /defineSlot\s?\(\s?["'](.*?)["']/.exec(str);
  return (match || [])[1];
};

class SmartAdserver extends AdserverBase {
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

  injectSmartCall(auction) {
    injectCall(sas, 'setup', (sasSetup, param, ...rest) => {
      param.renderMode = 2; // delay call
      return sasSetup(Object.assignparam, ...rest);
    });
    injectCall(sas, 'call', (sasCall, type, param, options, ...rest) => {
      let newParam = param;
      let newOptions = options;
      if (type === 'onecall') {
        if (!param.formats && param.formatId) {
          newParam = Object.assign({}, param, {
            formats: param.formatId.split(',').filter(s => s).map(s => parseInt(s.trim())),
          });
          delete newParam.formatId;
        }
        newOptions = Object.assign({}, options);
        const { onNoad } = newOptions; // old onNoad callback
        newOptions.onNoad = (param, ...rest2) => {
          const rendered = auction.renderUsingParams({
            tagId: param.tagId,
            events: {
              onAdResponse: ({ noAd }) => {
                if (onNoad) {
                  onNoad.call(options, ...rest2);
                }
              },
            },
          });
          if (!rendered) {
            onNoad.call(options, ...rest2);
          }
        };
      }
      return sasCall(newParam, newOptions, ...rest);
    });
  }

  initPrebidAuction(auction) {
    window.sas = window.sas || {};
    sas.cmd = sas.cmd || [];
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
      location: { win: window, appendTo: sasDiv},
      containers: [sasDiv],
    };
    if (!('googlePassbackUnit' in adUnit) && postbidParams) { // copy passback
      res.legacyPassbackHtml = postbidParams.legacyPassbackHtml;
      res.googlePassbackUnit = postbidParams.googlePassbackUnit;
    }
  }

  sendAdserverRequest(auction) {
    if (this.adserverRequestTriggered) {
      return;
    }
    this.adserverRequestTriggered = true;
    sas.cmd.push(() => {
      auction.adUnits.forEach((adUnit) => {
        const bid = auction.pbjs.getHighestCpmBids(adUnit.code)[0];
        if (bid) {
          sas.setHeaderBiddingWinner(adUnit.code, bid);
          auction.addWinningBid(adUnit.code, bid);
        }
      });
      sas.render();
    });
  }
}

export default SmartAdserver;
