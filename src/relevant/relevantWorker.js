/* eslint-disable */
require('../prebid');
import * as utils from '../utils';
import find from 'core-js/library/fn/array/find';
import PostbidAuction from './postbidAuction';
import PrebidAuction from './prebidAuction';
import SmartAdserver from './smartAdserver';
import DfpAdserver from './dfpAdserver';
import { isFunction } from './utils';
import { MAX_PASSBACK_GROUP_DELAY } from './constants';

const logToConsole = ~location.toString().indexOf('relevant-console');
const prebidDebug = ~location.toString().indexOf('relevant-debug');
const noCatch = ~location.toString().indexOf('relevant-no-catch');

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
      this.pageConfig = top.RELEVANT_PROGRAMMATIC_CONFIG || {};
    } catch(e) {
      this.pageConfig = {};
    }
    this.maxPassbackGroupDelay = this.pageConfig.maxPassbackGroupDelay || MAX_PASSBACK_GROUP_DELAY;
  }

  init() {
    this.flushQueue();
  }

  flushQueue() {
    while(this.queue.length) { // a bit wierd loop to make sure we can call this function recursivly
      const param = this.queue.splice(0, 1)[0];
      this.runCmd(param);
    }
    this.runPendingAuctions();
  }

  event(type, params) {
    const { pageConfig } = this;
    if (pageConfig[type]) {
      pageConfig[type](params);
    }
  }

  runCmd(param) {
    const CMDS = {
      postbid: param => this.doPostbid(param),
      prebid: param => this.doPrebid(param),
    };

    const runInternal = () => {
      if(isFunction(param)) {
        param();
      } else {
        if (!param || !CMDS[param.cmd]) {
          throw `Invalid parameter: ${(param || {}).cmd}`;
        }
        CMDS[param.cmd](param.param);
      }
    };

    if(noCatch) {
      runInternal();
      return;
    }

    try {
      runInternal();
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
    const { prebid } = this;
    let postbidParams = param;
    if(prebid && !param.isPostPrebid && prebid.renderUsingParams(param, true)) {
      return;
    }
    const postbid = new PostbidAuction(this, param);
    postbid.init();
    this.pendingAuctions.push(postbid);
  }

  doPrebid(param) {
    const prebid = new PrebidAuction(this, param);
    if(prebid.prebidAborted) {
      return; // page didn't want to wait for us
    }
    this.prebid = prebid;
    prebid.init();
  }

  runPendingAuctions() {
    const auctions = this.pendingAuctions;
    if(!auctions.length) {
      return;
    }
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
    //RelevantWorker.log(`log: ${param.cmd} - ${param.param.logIdentifier}`);
    let { groupMaxDelay } = param;
    if(groupMaxDelay === undefined) {
      if (param.cmd === 'postbid') {
        groupMaxDelay = this.maxPassbackGroupDelay;
      }
    }
    this.queue.push(param);
    if (!groupMaxDelay) {
      this.flushQueue();
    } else {
      const newDelayEnd = new Date() + groupMaxDelay;
      if(!this.delayEnd || newDelayEnd < this.delayEnd) {
        this.delayEnd = newDelayEnd;
        setTimeout(() => {
          this.delayEnd = null;
          this.flushQueue();
        }, groupMaxDelay);
      }
    }
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
