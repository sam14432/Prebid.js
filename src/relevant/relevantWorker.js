/* eslint-disable */
require('../prebid');
import * as utils from '../utils';
import find from 'core-js/library/fn/array/find';
import PostbidAuction from './postbidAuction';
import SmartAdserver from './smartAdserver';
import DfpAdserver from './dfpAdserver';

const logToConsole = ~location.toString().indexOf('relevant-console');
const prebidDebug = ~location.toString().indexOf('relevant-debug');

class RelevantWorker
{
  constructor(preQueue, pbjs) {
    Object.assign(this, {
      queue: preQueue || [],
      pbjs: pbjs,
      adservers: [],
      pendingAuctions: [],
      logToConsole,
      prebidDebug,
    });
    this.queue = preQueue || [];
    this.pbjs = pbjs;
    this.adservers = [];
    this.pendingAuctions = [];
    try {
      this.pageConfig = top.RELEVANT_POSTBID_CONFIG || {};
    } catch(e) {
      this.pageConfig = {};
    }
  }

  init() {
    this.queue.forEach(param => this.runCmd(param));
    this.runPendingAuctions();
  }

  event(type, params) {
    const { pageConfig } = this;
    if (pageConfig.type) {
      pageConfig.type(params);
    }
  }

  runCmd(param) {
    const CMDS = {
      postbid: param => this.doPostbid(param),
      prebid: param => this.doPrebid(param),
    };
    try {
      if(!param || !CMDS[param.cmd]) {
        throw `Invalid parameter: ${(param || {}).cmd}`;
      }
      CMDS[param.cmd](param.param);
    } catch(e) {
      RelevantWorker.log(`Command error: ${e.message}`);
      if(param.onError) {
        try {
          param.onError(e);
        } catch(e) {
          RelevantWorker.log(`Error in error handler: ${e.message}`);
        }
      }
    }
  }

  static log(str) {
    if (!prebidDebug && !logToConsole) {
      return;
    }
    const fmt = (num, n) => {
      let res = num.toString();
      for (let i = n - res.length; i > 0; --i) {
        res = '0' + res;
      }
      return res;
    };
    const now = new Date();
    const dateStr = `${fmt(now.getHours(), 2)}:${fmt(now.getMinutes(), 2)}:${fmt(now.getSeconds(), 2)}.${fmt(now.getMilliseconds(), 3)}`;
    const msg = `[${dateStr}] ${str}`;
    utils.logInfo(msg);
    if (logToConsole) {
      console.info(msg);
    }
  }

  doPostbid(param) {
    const postbid = new PostbidAuction(this, param);
    postbid.init();
    this.pendingAuctions.push(postbid);
  }

  doPrebid(param) {
    this.prebid = new PrebidAuction(this, param);
    this.prebid.init();
  }

  runPendingAuctions() {
    const auctions = this.pendingAuctions;
    this.pendingAuctions = [];
    PostbidAuction.requestMultipleBids(auctions);
  }

  getAdserver(type) {
    let Type;
    if(type === 'smart') {
      Type = SmartAdserver;
    } else {
      Type = DfpAdserver;
    }
    if(!Type) {
      throw Error(`No adserver type '${type}'`);
    }
    let adserver = find(this.adservers, ads => ads instanceof Type);
    if (!adserver) {
      adserver = new Type();
      this.adservers.push(adserver);
    }
    return adserver;
  }

  push(param) {
    this.runCmd(param);
    this.runPendingAuctions();
  }

  static staticInit() {
    ((pbjs, orgQueueFn) => {
      if (!pbjs || !orgQueueFn) {
        throw Error('window.pbjs must exist at this stage');
      }
      let initialized;
      pbjs.processQueue = function(...args) {
        const res = orgQueueFn.call(this, ...args);
        if(!initialized) {
          initialized = true;
          window.relevantQueue = new RelevantWorker(window.relevantQueue, pbjs);
          window.relevantQueue.init();
        }
        return res;
      };
    })(window.$$PREBID_GLOBAL$$, window.$$PREBID_GLOBAL$$.processQueue);
  }
}

RelevantWorker.log('Initializing..');
RelevantWorker.staticInit();
