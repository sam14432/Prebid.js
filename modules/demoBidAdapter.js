import { registerBidder } from '../src/adapters/bidderFactory';

const BIDDER_CODE = 'demo';

export const spec = {
  code: BIDDER_CODE,
  supportedFormat: ['banner'],
  isBidRequestValid() { return true; },
  interpretResponse(response, bidRequest) {
    return response.body.filter(elm => elm.hasBid);
  },

  buildRequests(bidRequest, bidderRequest) {
    const req = bidRequest.map((bid) => {
      const cpm = Math.random() * ('avgRevenue' in bid.params ? bid.params.avgRevenue : 2);
      const [ width, height ] = (bid.sizes || [])[0] || [100, 100];
      const bidderName = bid.bidder === BIDDER_CODE ? 'Demo' : bid.bidder.charAt(1).toUpperCase() + bid.bidder.slice(2);
      return {
        bidId: bid.bidId,
        requestId: bid.bidId,
        creativeId: bid.bidId,
        cpm,
        width,
        height,
        ad: `
          <div
              style="background: lightgreen; font-size: 30; width: ${width}px; height: ${height}px;"
          >
              ${bidderName} <br>$ ${cpm.toFixed(4)}
          </div>`,
        netRevenue: true,
        currency: 'USD',
        ttl: 60,
        hasBid: ('chance' in bid.params ? bid.params.chance : 0.15) >= Math.random(),
      };
    });
    return {
      method: 'POST',
      url: `data:application/json,${JSON.stringify(req)}`,
      data: JSON.stringify({}),
      options: {
        contentType: 'application/json',
        withCredentials: true
      },
      bidderRequest
    }
  },
}

export function matchRequest(id, bidRequest) {
  const {bids} = bidRequest.bidderRequest;
  const [returnValue] = bids.filter(bid => bid.bidId === id);
  return returnValue;
}

registerBidder(spec);
