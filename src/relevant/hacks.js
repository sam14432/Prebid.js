import SmartAdserver from './smartAdserver';

const sasDiv = auction => auction.adserver instanceof SmartAdserver && auction.containers[0];

const Foreca = {
  matches: () => location.hostname.indexOf('foreca') >= 0,
  onAdResponse: ({ auction }) => {
    const div = sasDiv(auction);
    if (div) {
      div.style.height = 'auto'; // makes top-banner-container resize correctly in site-code
    }
  },
};

const Manatee = {
  matches: (auction) => {
    const div = sasDiv(auction);
    return div && div.getAttribute('id') === 'mboost-ds1';
  },

  onAdResponse: ({ auction }) => {
    if (auction.gptDiv) {
      auction.gptDiv.style.textAlign = 'inherit'; // makes left-banner move correctly to right
    }
  },
}

export default [Foreca, Manatee];
