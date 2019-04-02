const mergeNonExisting = (dst, ...sources) => {
  sources.forEach((src) => {
    if (!dst || typeof dst !== 'object' || !src || typeof src !== 'object') {
      return;
    }
    for (var key in src || {}) {
      if (key in dst) {
        mergeNonExisting(dst[key], src[key]);
      } else {
        dst[key] = src[key]
      }
    }
  });
  return dst;
}

const injectCall = (obj, fnName, fn) => {
  let realCall = obj[fnName];
  const orgCaller = (...args) => {
    if (!realCall) {
      throw Error(`We haven't received orignal function '${fnName}' yet!`);
    }
    realCall.call(obj, ...args);
  };
  const fnWrapper = (...args) => fn(orgCaller, ...args)
  if (realCall) { // it already exists
    obj[fnName] = fnWrapper;
  } else {
    Object.defineProperty(obj, fnName, {
      get: () => fnWrapper,
      set: (orgFn) => {
        realCall = orgFn;
      },
    });
  }
};

const asElm = (win, elm) => {
  if (!elm) {
    return elm;
  }
  if (typeof elm === 'string' || elm instanceof String) {
    const res = win.document.querySelector(elm);
    if (!res) {
      throw Exception(`Failed to find element '${elm}'`);
    }
    return res;
  }
  return elm;
};

const setSize = (elm, width, height, useDisplayNone) => {
  const toDim = v => isNaN(v) ? v : v + 'px';
  if (width != null) {
    elm.style.width = toDim(width);
  }
  if (height != null) {
    elm.style.height = toDim(height);
  }
  if (useDisplayNone && width != null && height != null) {
    if (!width && !height) {
      elm.style.display = 'none';
    } else if (elm.style.display === 'none') {
      elm.style.display = null;
    }
  }
};

const createIframe = (location, width, height, extraAttribs, extraStyle) => {
  let { win, insertAfter, appendTo } = location || {};
  if (!win) {
    throw Error('location.win not defined');
  }
  const noSpec = !insertAfter && !appendTo;
  const doc = win.document;
  if (win === top) {
    if (noSpec) {
      throw Error('Need to specify where to insert iframe if in top window');
    }
  }
  if (noSpec) {
    if (!doc.body) {
      throw Error(`document.body missing`);
    }
    appendTo = doc.body;
  }

  var iframe = doc.createElement('iframe');
  const attribs = Object.assign({
    FRAMEBORDER: 0,
    SCROLLING: 'no',
    MARGINHEIGHT: 0,
    MARGINWIDTH: 0,
    TOPMARGIN: 0,
    LEFTMARGIN: 0,
    ALLOWTRANSPARENCY: 'true',
    ALLOWFULLSCREEN: 'true',
    ALLOW: 'autoplay',
    width: width,
    height: height,
  }, extraAttribs);
  for (const [key, value] of Object.entries(attribs)) {
    iframe.setAttribute(key, value);
  }
  Object.assign(iframe.style, extraStyle);
  insertAfter = asElm(win, insertAfter);
  appendTo = asElm(win, appendTo);
  if (insertAfter) {
    insertAfter.parentNode.insertBefore(iframe, insertAfter.nextSibling);
  } else if (appendTo) {
    appendTo.appendChild(iframe);
  }
  return iframe;
};

const isFunction = obj => ({}).toString.call(obj) === '[object Function]';

const isIframeAccessible = (ifr) => {
  try {
    if (ifr.contentWindow.dummyAccessCheck) {
      console.info();
    }
  } catch (e) {
    return false;
  }
  return true;
};

module.exports = {
  mergeNonExisting,
  injectCall,
  asElm,
  setSize,
  createIframe,
  isFunction,
  isIframeAccessible,
};
