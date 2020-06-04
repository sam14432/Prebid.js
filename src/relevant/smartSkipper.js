class SmartSkipper {
  constructor(worker) {
    Object.assign(this, {
      worker,
      renderSeen: {},
    });
    this.auction().log('Smart Adserver skipper created');
  }

  auction() {
    return this.worker.prebid;
  }

  setupSetupParams(newParam) {
    newParam.renderModeTimeout = 1000 * 3600 * 24 * 7;
  }

  setupCallParams(newParam, newOptions) {
    Object.assign(this, {
      newParam: Object.assign({}, newParam), // include later exlucded
      newOptions,
      passThroughFmtIds: {},
    });
    newParam.formats = newParam.formats.filter(({ id, tagId }) => {
      tagId = tagId || `sas_${id}`;
      if (!this.auction().unitsByCode[tagId]) {
        this.passThroughFmtIds[id] = true;
        return true;
      }
    })
  }

  skipHandleRender(fmtId) {
    if (fmtId) {
      this.renderSeen[fmtId] = true;
    }
    if (fmtId === undefined || this.fakedNoAdFormats) {
      this.triggerNoAdForRenderedFormats();
    }
    return fmtId && !this.passThroughFmtIds[fmtId];
  }

  triggerNoAdForRenderedFormats() {
    this.fakedNoAdFormats = this.fakedNoAdFormats || {};
    const { newParam, newOptions, renderSeen, fakedNoAdFormats, passThroughFmtIds } = this;
    const { onLoad, onNoad } = newOptions;
    (newParam.formats || []).forEach((fmt) => {
      let { id: formatId, tagId } = fmt;
      if (renderSeen[formatId] && !fakedNoAdFormats[formatId] && !passThroughFmtIds[formatId]) {
        this.auction().log(`Skipping adserver request for format '${formatId}'`);
        fakedNoAdFormats[formatId] = true;
        tagId = tagId || `sas_${formatId}`;
        onLoad({ formatId, tagId, hasAd: false });
        onNoad({ formatId, tagId });
      }
    });
  }
}

export default SmartSkipper;
