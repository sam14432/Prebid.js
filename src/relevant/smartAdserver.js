import AdserverBase from './adserverBase';

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
}

export default SmartAdserver;
