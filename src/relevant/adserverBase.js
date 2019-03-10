class AdserverBase {
  initPostbidAuction(auction) {}

  createGptPassbackDiv(auction, adContainer) {
    const gptDiv = auction.createGptDiv(top.document, false);
    adContainer.appendChild(gptDiv);
    return gptDiv;
  }

  getAdContainer(elm) {
    return elm.parentNode;
  };
}

export default AdserverBase;
