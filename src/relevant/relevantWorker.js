/* eslint-disable */
require('../prebid');
import * as utils from '../utils';
import PostbidAuction from './postbidAuction';
import SmartAdserver from './smartAdserver';
import DfpAdserver from './dfpAdserver';

class RelevantWorker
{
  constructor(preQueue, pbjs) {
    this.queue = preQueue || [];
    this.pbjs = pbjs;
    this.adservers = [];
  }

  init() {
    this.pbjs.setConfig({
      consentManagement: {},
      debug: ~location.toString().indexOf('relevant-debug'),
    });
    this.queue.forEach(param => this.runCmd(param));
  }

  runCmd(param) {
    const CMDS = {
      postbid: param => this.doPostbid(param),
    };
    try {
      if(!param || !CMDS[param.cmd]) {
        throw `Invalid parameter: ${(param || {}).cmd}`;
      }
      CMDS[param.cmd](param.param);
    } catch(e) {
      utils.logError(`Command error: ${e.message}`);
      if(param.onError) {
        try {
          param.onError(e);
        } catch(e) {
          utils.logError(`Error in error handler: ${e.message}`);
        }
      }
    }
  }

  doPostbid(param) {
    const postbid = new PostbidAuction(this, param);
    postbid.run();
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
    let adserver = this.adservers.find(ads => ads instanceof Type);
    if (!adserver) {
      adserver = new Type();
      this.adservers.push(adserver);
    }
    return adserver;
  }

  push(param) {
    this.runCmd(param);
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
    })(window.pbjs, window.pbjs.processQueue);
  }
}

RelevantWorker.staticInit();
