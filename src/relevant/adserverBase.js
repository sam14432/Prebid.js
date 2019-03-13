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

  createGptPassbackDiv(auction, adContainer) {
    const gptDiv = auction.createGptDiv(top.document, false, false, {
      width: adContainer.clientWidth,
      height: adContainer.clientHeight,
    });
    adContainer.appendChild(gptDiv);
    return gptDiv;
  }

  getAdContainer(elm) {
    return elm.parentNode;
  };
}

export default AdserverBase;
