import AdserverBase from './adserverBase';

class DfpAdserver extends AdserverBase {
  createGptPassbackDiv(auction, adContainer, dimensions) {
    const gptDiv = auction.createGptDiv(top.document, dimensions);
    adContainer.parentNode.insertBefore(gptDiv, adContainer);
    return gptDiv;
  }

  getAdContainer(elm) {
    if (elm.parentNode) {
      const grandParent = elm.parentNode.parentNode;
      if (grandParent && ~(elm.parentNode.getAttribute('id') || '').indexOf('google_ads_iframe_')) {
        if (grandParent.getAttribute('data-google-query-id')) {
          return grandParent;
        } else {
          return null;
        }
      }
    }
    return elm.parentNode || elm;
  };
}

export default DfpAdserver;
