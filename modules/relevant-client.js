/* eslint-disable */
import * as utils from 'src/utils';

class Postbid
{
  constructor(params) {
    const DEFAULT = {
      bidTimeOut: 1000,
      useIframeResizer: true,
    };
    Object.assign(this, DEFAULT, params);
  }

  run() {
    if(this.useIframeResizer) {
      const raw = require('!raw-loader!iframe-resizer/js/iframeResizer.contentWindow');
      require('iframe-resizer/js/iframeResizer');
    }
  }
}

class RelevantWorker
{
  constructor(preQueue) {
    this.queue = preQueue || [];
  }

  init() {
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
      CMDS[param.cmd](param);
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
    const postbid = new Postbid(param);
    postbid.run();
  }

  push(param) {
    this.runCmd(param);
  }
};

var pbjs = window.pbjs || {};
pbjs.que = pbjs.que || [];
pbjs.que.push(function () {
  window.relevantQueue = new RelevantWorker(window.relevantQueue);
  window.relevantQueue.init();
});


