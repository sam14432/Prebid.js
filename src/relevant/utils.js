const mergeNonExisting = (dst, ...sources) => {
  sources.forEach((src) => {
    if(!dst || typeof dst !== 'object' || !src || typeof src !== 'object') {
      return;
    }
    for(var key in src || {}) {
      if(key in dst) {
        mergeNonExisting(dst[key], src[key]);
      } else {
        dst[key] = src[key]
      }
    }
  });
  return dst;
}

module.exports = {
  mergeNonExisting,
};
