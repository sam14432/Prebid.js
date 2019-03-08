import AdserverBase from './adserverBase';

function isAdUnitCode(str) {
  if(!str || str.length > 100) {
    return false;
  }
  var FORBIDDEN = '<> ';
  for(var i = 0; i < FORBIDDEN.length; i++) {
    if(str.indexOf(FORBIDDEN[i]) >= 0) {
      return false;
    }
  }
  return true;
}

class SmartAdserver extends AdserverBase
{
  initPostbidAuction(auction) {
    if (!auction.googlePassbackUnit && isAdUnitCode(auction.legacyPassbackHtml)) {
      auction.googlePassbackUnit = `${auction.adunitPathPrepend || ''}${auction.legacyPassbackHtml}`;
      auction.legacyPassbackHtml = null;
    }
  }
}

export default SmartAdserver;
