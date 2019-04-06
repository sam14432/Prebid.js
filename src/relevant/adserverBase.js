class AdserverBase {
  initPostbidAuction(auction) {
    (auction.containers || []).forEach((elm) => {
      if (auction.minWidth) {
        elm.style.minWidth = `${auction.minWidth}px`;
      }
      if (auction.minHeight) {
        elm.style.minHeight = `${auction.minHeight}px`;
      }
    });
  }

  getPbjsConfig() { return null; }

  getAdserverDefaults() {
    return {};
  }

  initPrebidAuction() {
    throw Error('Prebid not implemented for adserver');
  }

  sendAdserverRequest() {
    throw Error('Prebid not implemented for adserver');
  }

  getAdUnitCodeFromParams() {
    throw Error('Prebid not implemented for adserver');
  }

  getPostPrebidParams() {
    throw Error('Prebid not implemented for adserver');
  }

  createGptPassbackDiv(auction, adContainer, dimensions) {
    const gptDiv = auction.createGptDiv(top.document, dimensions);
    adContainer.appendChild(gptDiv);
    return gptDiv;
  }

  getAdContainer(elm) {
    return elm.parentNode;
  };
}

export default AdserverBase;
