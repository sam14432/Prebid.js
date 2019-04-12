# Prebid.js integration with Smart Adserver and Relevant Programmatic

Integrating **Prebid.js** for pre-bidding on a site with **Smart** and **Relevant Programmatic** can be done using different methods. Here we'll cover these methods from the easiest (one-liner) to the most manual one (that gives most flexibility).

The implementation is a *fork* of Prebid.js and is compatible with our **Postbid** template. This means you can enable/disable pre-bidding "at will" on the site without having to worry about existing postbid insertions in Smart. When pre-bidding is enabled and a postbid insertion is selected - then the effect is the same as "no ad". That means that no Smart RTB+ / direct campaign could out-compete the header bidding winner so that the header bidding winner (or Google AdX) will be chosen instead.

#### Optimization - preload the libary

It is normally desirable to pre-load the library used by your prebid configuration file. The following line should be put into the head of the page in order to load it from our default location which is used by the prebid configuration.

```html
<link rel="preload" href="//cdn.relevant-digital.com/client-lib/v2/relevant-client-lib.js" as="script">
```

## Method 1 - one-line integration

Include the following line in of your page. Make sure it is included *before* either the loading of **smart.js** *or* the first call so **sas.cmd.push()**

```html
<script data-relevant-sync-init-prebid src="//apps-cdn.relevant-digital.com/static/tags/[PREBID_CONFIG].js"></script>
```

* Replace **[PREBID_CONFIG]** with the name provided to you by Relevant.
* Make sure to *not* use **async**, using this method we must load the script synchronously.
* Make sure the **data-relevant-sync-init-prebid** attribute is present. The existence of that attribute on an element in the document tells the script to initialize the code necessary to not having do do any further changes.

This will enable Prebid.js pre-bidding by intercepting the following Smart JavaScript functions

* **sas.setup()** - Sets the **renderMode = 2** parameter
* **sas.call()** - Convert calls to the right POST *onecall* format, etc.
* **sas.render()** - Pick up which formats that should be part of the header-bidding auctions.
* **sas.cmd.*push*()** - Delay callback until after the main .js file that includes Prebid.js has loaded.

To get more info about how the Smart-calls are made, read this: <https://support.smartadserver.com/s/article/Holistic-Setup>

## Method 2 - asynchronous load

We can load the same script as above asynchronously, but in this case we must make sure that it is *either* loaded before:

* Loading **smart.js**
* The first call to **sas.cmd.push()**

In the following example we make sure it loads before **smart.js**.

So let's say we load **smart.js** this way:

```html
<script src="//ced.sascdn.com/tag/2545/smart.js" async=""></script>
```

We can then replace that with the following:

```html
<script>
(function() {
    var pbScript = document.createElement('script');
    pbScript.onload = function() { // load smart.js *after* prebid config
        var smartScript = document.createElement('script');
        smartScript.src = '//ced.sascdn.com/tag/2545/smart.js';
        document.head.appendChild(smartScript);
    };
    pbScript.setAttribute('data-relevant-sync-init-prebid', '');
    pbScript.src = '//apps-cdn.relevant-digital.com/static/tags/[PREBID_CONFIG].js';   	
    document.head.appendChild(pbScript);
})();
</script>
```

*Remember to replace **[PREBID_CONFIG]** with the right name.*

## Method 3 - asynchronous load without having to delay smart.js or sas.cmd.push() calls

We can manually include the "stub" code in the prebid configuration JavaScript and then load the prebid config like this:

```html
<script>
(function () {
	window.sas = sas || {};
	sas.cmd = sas.cmd || [];

	/** Global settings object that will be used by Relevant's Prebid version */
	window.RELEVANT_PROGRAMMATIC_CONFIG = {
	
		/** Callback when prebid is intialized and the Smart cmds can be called */
		onInitPrebidDone: function(param) {
			param.auction.log('Loaded after ' + (new Date() - timeoutStart) + ' ms');
			prebidInitialized = true;
			flushSasOps();
		},
	};

	/** How long time to wait *without* getting the onInitPrebidDone() callback above
	 * until we skip prebid and calls Smart without prebid */
	var TIMEOUT_MS = 1000;

	/** Overwrites sas.cmd.push with relevantSasCmd - in case that change has not
	 * been done everywhere */
	var INJECT_SMART_CMD = true;

	// Smart cmds that are queued until prebid is initialized *or* until we've timed out
	var pendingSasOps = [];
	
	// Will be set to true by the onInitPrebidDone() callback above
	var prebidInitialized = false;
	
	// Original sas.cmd.push when INJECT_SMART_CMD = true
	var orgSasPush;
	
	// Just for printing the diagnostic message above
	var timeoutStart = new Date();

	/** INJECT_SMART_CMD */
	function sasPush(fn) {
		if(orgSasPush) {
			orgSasPush.call(sas.cmd, fn);
		} else {
			sas.cmd.push(fn);
		}
	}

	/** Flush pending Smart cmds */
	function flushSasOps() {
		for(var i = 0; i < (pendingSasOps || []).length; i++) {
			sasPush(pendingSasOps[i]);
		}
		pendingSasOps = null;
	}

	/** Replacement for sas.cmd.push(), will delay calling that function until
	 * prebid is initalized (or we've timed out) */
	window.relevantSasCmd = function(fn) {
		if(prebidInitialized || RELEVANT_PROGRAMMATIC_CONFIG.prebidAborted) {
			sasPush(fn)
		} else {
			pendingSasOps.push(fn);
		}
	}

	/** Will abort attempt to use prebid and run all pending Smart cmds if Prebid
	 * has not been initialized after TIMEOUT_MS */	
	setTimeout(function() {
		if(!prebidInitialized) {
			console.warn('Aborting loading of Prebid.js after ' + TIMEOUT_MS + ' ms');
			RELEVANT_PROGRAMMATIC_CONFIG.prebidAborted = true;
			flushSasOps();
		}
	}, TIMEOUT_MS);

	/** Replace sas.cmd.push() with relevantSasCmd() */
	if(INJECT_SMART_CMD) {
		pendingSasOps = sas.cmd.slice();
		sas.cmd = [];
		orgSasPush = sas.cmd.push;
		Object.defineProperty(sas.cmd, 'push', {
			get: function() { return relevantSasCmd; },
			set: function(orgFn) {
				orgSasPush = orgFn;
			},
		});
	}
})()
</script>
<script async src="//apps-cdn.relevant-digital.com/static/tags/[PREBID_CONFIG].js"></script>
```

*Remember to replace **[PREBID_CONFIG]** with the right name.*

* As before, the code itself must be placed before loading **smart.js** or the first call to **sas.cmd.push()**
* The **TIMEOUT_MS** (default is 1000) can be changed to determine what is the maximum milliseconds to wait for Prebid.js to load until we skip pre-bidding completely and goes on with the ad-requests. Notice that this is *not* the same timeout that is *later* used to determine how long time after *bidding has started* until we should proceed with the ad-requests. That value is instead controlled by **RELEVANT_PROGRAMMATIC_CONFIG.failsafeTimeout** (listed in the configuration section later).
* The global **relevantSasCmd()** function is created as a replacement for **sas.cmd.push()**. If you manually replace all instances (in top-window of the page) of **sas.cmd.push()** with **relevantSasCmd()** - you can then set **INJECT_SMART_CMD = false**, as that interception will no longer be necessary.

## Method 4 - Manual integration without intercepting any Smart JS functions

*TODO:* Please let us know if you need such guide..

## Configuration

The configuration object is the global **window.RELEVANT_PROGRAMMATIC_CONFIG** object that you can create *before* loading the prebid configuration.

#### Manually select formats to use with header bidding

We only want to bid on formats that is actually rendered during the page view. As default these formats are picked up by intercepting **sas.render()** (optionally they can be picked up by **sas.call()** instead). However, this is not optimal because of the following reasons:

* There might be an extra delay until header bidding can start.
* After the first render() call the code only wait (using *setTimeout*) until the current run of the JS event loop  has finished. Using certain site-designs this might cause us to miss some formats that will hence not be part of the header bidding.

##### Option 1 - Always bid on all all formats (not recommended)

```html
<script>
    RELEVANT_PROGRAMMATIC_CONFIG = {
    	delayStartPrebid: false,
    	sasOnlyUseRendered: false,
    };
</script>
<script data-relevant-sync-init-prebid src="//apps-cdn.relevant-digital.com/static/tags/[PREBID_CONFIG].js"></script>
```

This configuration removes the problems above but introduces the (probably larger) issue that we'll do auctions on all possible formats in our prebid-configuration which most likely will include a lot of formats we're not going to use (like desktop-formats on the mobile page, etc). That might negatively impact the page-load time.

##### Option 2 - Manually select only formats that will be rendered using tag names (recommended)

In the following example we use the **allowedAdUnits** field to specify which formats we should create header bidding auction for. Notice that this assumes the same logic is actually used to determine which formats that will be rendered.

```html
<script>
    RELEVANT_PROGRAMMATIC_CONFIG = {
    	delayStartPrebid: false,
    	sasOnlyUseRendered: false,
        allowedAdUnits: matchMedia("(min-width: 768px)") ?
        	['sas_1234', 'sas_4321', 'sas_3214', 'sas_4141'] // "desktop" formats
        	: ['sas_54321', 'sas_65432'], // "mobile" formats
    };
</script>
<script data-relevant-sync-init-prebid src="//apps-cdn.relevant-digital.com/static/tags/[PREBID_CONFIG].js"></script>
```

Optionally **allowedAdUnits** can instead be a *function* that will receive a Prebid ad unit (<http://prebid.org/dev-docs/adunit-reference.html>) and then return whether the ad unit (format) should be used. The **code** field in the parameter to the function will be the tag name (for example 'sas_12345').

#### Configuration parameter reference

This section lists the available fields of the **RELEVANT_PROGRAMMATIC_CONFIG** object. These are either *Settings* or *Callback functions*.

##### Settings

| Name                        | Description                                                  |
| --------------------------- | ------------------------------------------------------------ |
| allowedAdUnits              | Which ad units to use for header bidding, please see the previous section. |
| forcePassbackInIframe       | Insert Google AdX inside an extra iframe. This might of unknown reasons increase Active View % somewhat which may increase revenue. |
| useIframeResizer            | For Google AdX and passbacks, repeatedly check size of content in iframe and resize it accordingly. |
| sizeCheckIvl                | When **useIframeResizer = true**. How many milliseconds between each size check. |
| sizeCheckDuration           | When **useIframeResizer = true**. Total duration for how many milliseconds the checks should be done. |
| hidePassbackUntilFinished   | Hide Google Adx and possible passback until rendering has finished and and an ad was displayed (otherwise stay hidden). |
| googleCollapseEmptyDivStyle | For Google Adx, defines how to call googletag.pubads().collapseEmptyDivs(true):<br /><br />'**full**' - collapse div until an ad is returned.<br />**'post'** - collapse div *after* the response is empty (no ad)<br />**(any other value)** - don't use collapseEmptyDivs() |
| forceGptInIframe            | When **forcePassbackInIframe = true**, this will load a separate Google Publisher Tag (gpt.js) into each iframe. |
| disableGptSingleRequest     | Disable single request mode for Google Ad Manager. Notice that when **forceGptInIframe = true**, single request mode will always be disabled. |
| failsafeTimeout             | How long time after initialization until we should go on with the ad requests even though we didn't get bids back. Notice that there is still a chance that header bidding winners will be shown if bids are returned before the ad-request is finished (but they won't compete with RTB+ / direct campaigns). |
| delayStartPrebid            | Don't start header bidding as soon as possible. The purpose is to use some automatic method to pick up which ad-units that should be part of the header bidding (which ones that are on the page). For Smart **sas.call()** is used to or **sas.render()**, in case **sasOnlyUseRendered** is true. |
| pbjsConfig                  | The Prebid.js configuration object. These settings will be merged with the default Prebid.js config used Relevant. |
| injectSmartCalls            | Intercept Smart JS calls. Set to *false* if you're integrating using **Method 4** above. |
| sasOnlyUseRendered          | Pick up which ad-units to create auctions for based upon which formats that are rendered using **sas.render()**. |
| waitInitPrebidMs            | Only used with **Method** **1** and **2**. This corresponds to **TIMEOUT_MS** in **Method 3**. |
| injectSmartCmd              | Only used with **Method** **1** and **2**. This corresponds to **INJECT_SMART_CMD** in **Method 3**. |

##### Callback function

| Name                     | Description                                                  |
| ------------------------ | ------------------------------------------------------------ |
| onAdResponse(params)     | Callback when an ad has been rendered. If *no ad* was returned, then **params.noAd** = true |
| onAdDimensions(params)   |                                                              |
| onInitPostbid(params)    |                                                              |
| onInitPrebid(params)     |                                                              |
| onInitPrebidDone(params) |                                                              |









