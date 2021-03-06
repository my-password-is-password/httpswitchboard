/*******************************************************************************

    httpswitchboard - a Chromium browser extension to black/white list requests.
    Copyright (C) 2013  Raymond Hill

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see {http://www.gnu.org/licenses/}.

    Home: https://github.com/gorhill/httpswitchboard
*/

/******************************************************************************/

/*jshint multistr: true */
var rootFrameReplacement = "<!DOCTYPE html> \
<html> \
<head> \
<style> \
@font-face { \
font-family: 'httpsb'; \
font-style: normal; \
font-weight: 400; \
src: local('httpsb'), url('{{fontUrl}}') format('truetype'); \
} \
body { \
margin: 0; \
border: 0; \
padding: 0; \
font: 13px httpsb,sans-serif; \
width: 100%; \
height: 100%; \
background: transparent url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QkOFgcvc4DETwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAACGSURBVFjD7ZZBCsAgEAMT6f+/nJ5arYcqiKtIPAaFYR2DFCAAgEQ8iwzLCLxZWglSZgKUdgHJk2kdLEY5C4QAUxeIFOINfwUOBGkLPBnkAIEDQPoEDiw+uoGHBQ4ovv4GnvTMS4EvC+wvhBvYAltgC2yBLbAFPlTgvKG6vxXZB6QOl2S7gNw6ktgOp+IH7wAAAABJRU5ErkJggg==') repeat; \
text-align: center; \
} \
div { \
margin: 2px; \
border: 0; \
padding: 0 2px; \
display: inline-block; \
color: white; \
background: #c00; \
} \
</style> \
<link href='{{cssURL}}?url={{originalURL}}&hostname={{hostname}}&t={{now}}' rel='stylesheet' type='text/css'> \
<title>Blocked by HTTPSB</title> \
</head> \
<body title='&ldquo;{{hostname}}&rdquo; blocked by HTTP Switchboard'> \
<div>{{hostname}}</div> \
</body> \
</html>";

var subFrameReplacement = "<!DOCTYPE html> \
<html> \
<head> \
<style> \
@font-face { \
font-family: 'httpsb'; \
font-style: normal; \
font-weight: 400; \
src: local('httpsb'), url('{{fontUrl}}') format('truetype'); \
} \
body { \
margin: 0; \
border: 0; \
padding: 0; \
font: 13px httpsb,sans-serif; \
width: 100%; \
height: 100%; \
background: transparent url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACMAAAAjCAYAAAAe2bNZAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3QkOFgcvc4DETwAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAACGSURBVFjD7ZZBCsAgEAMT6f+/nJ5arYcqiKtIPAaFYR2DFCAAgEQ8iwzLCLxZWglSZgKUdgHJk2kdLEY5C4QAUxeIFOINfwUOBGkLPBnkAIEDQPoEDiw+uoGHBQ4ovv4GnvTMS4EvC+wvhBvYAltgC2yBLbAFPlTgvKG6vxXZB6QOl2S7gNw6ktgOp+IH7wAAAABJRU5ErkJggg==') repeat; \
text-align: center; \
} \
div { \
margin: 2px; \
border: 0; \
padding: 0 2px; \
display: inline-block; \
color: white; \
background: #c00; \
} \
</style> \
<title>Blocked by HTTPSB</title> \
</head> \
<body title='&ldquo;{{hostname}}&rdquo; blocked by HTTP Switchboard'> \
<div>{{hostname}}</div> \
</body> \
</html>";

/******************************************************************************/

// Intercept and filter web requests according to white and black lists.

function onBeforeRequestHandler(details) {
    // quickProfiler.start();

    // console.debug('onBeforeRequestHandler()> "%s"', details.url);

    var canEvaluate = true;
    var httpsb = HTTPSB;
    var tabId = details.tabId;

    // Do not ignore traffic outside tabs
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
        // console.debug('onBeforeRequestHandler()> behind-the-scene: "%s"', details.url);
    }

    var requestURL = uriTools.normalizeURI(details.url);
    var hostname, pageURL;

    // Don't block chrome extensions
    // rhill 2013-12-10: Avoid regex whenever a faster indexOf() can be used:
    // here we can use fast indexOf() as a first filter -- which is executed
    // for every single request (so speed matters).
    if ( requestURL.indexOf(httpsb.chromeExtensionURLPrefix) === 0 ) {
        // If it is HTTP Switchboard's root frame replacement URL, verify that
        // the page that was blacklisted is still blacklisted, and if not,
        // redirect to the previously blacklisted page.
        if ( details.parentFrameId < 0 && requestURL.indexOf(httpsb.noopCSSURL) === 0 ) {
            var matches = requestURL.match(/url=([^&]+)&hostname=([^&]+)/);
            if ( matches ) {
                pageURL = decodeURIComponent(matches[1]);
                hostname = decodeURIComponent(matches[2]);
                if ( httpsb.whitelisted(pageURL, 'main_frame', hostname) ) {
                    chrome.runtime.sendMessage({
                        what: 'gotoURL',
                        tabId: tabId,
                        url: pageURL
                    });
                }
            }
        }
        // Chrome extensions are not processed further
        // quickProfiler.stop('onBeforeRequestHandler');
        return;
    }

    // If it's a root frame or an app, bind to a new page stats store
    var type = details.type;
    var isSubFrame = type === 'sub_frame';
    var isMainFrame = type === 'main_frame';
    var isWebPage = isMainFrame && details.parentFrameId < 0;
    var pageStats = pageStatsFromTabId(tabId);

    // rhill 2013-12-16: Do not interfere with apps. For now the heuristic is:
    // If we have a `sub_frame` and no pageStats store, this is an app.
    // https://github.com/gorhill/httpswitchboard/issues/91
    var isApp = isSubFrame && !pageStats;

    if ( isWebPage || isApp ) {
        bindTabToPageStats(tabId, requestURL);
    }

    pageStats = pageStatsFromTabId(tabId);

    // rhill 2013-12-16: I don't remember... Can pageStats still be nil at
    // this point?
    // Answer: Yes. Requests might still be dispatched after
    // closing a tab it appears.
    // if ( !pageStats ) {
    //    console.error('onBeforeRequestHandler() > no pageStats: %o', details);
    // }

    if ( isApp && pageStats ) {
        pageStats.ignore = true;
    }

    hostname = uriTools.hostnameFromURI(requestURL);
    pageURL = pageUrlFromPageStats(pageStats);

    // rhill 2013-12-15:
    // Try to transpose generic `other` category into something more
    // meaningful.
    if ( type === 'other' ) {
        type = httpsb.transposeType(type, requestURL);
    }

    if ( pageStats && pageStats.ignore ) {
        canEvaluate = false;
    }

    // Block request?
    // https://github.com/gorhill/httpswitchboard/issues/27
    var block = false;
    if ( canEvaluate ) {
        block = httpsb.blacklisted(pageURL, type, hostname);
    }

    if ( pageStats ) {
        // rhill 2014-01-15: Delay logging of non-blocked top `main_frame`
        // requests, in order to ensure any potential redirects is reported
        // in proper chronological order.
        // https://github.com/gorhill/httpswitchboard/issues/112
        if ( !isWebPage || block ) {
            pageStats.recordRequest(type, requestURL, block);
        }
    }

    // Collect global stats
    httpsb.requestStats.record(type, block);

    // whitelisted?
    if ( !block ) {
        // console.debug('onBeforeRequestHandler > allowing %s from %s', type, hostname);

        // If the request is not blocked, this means the response could contain
        // cookies. Thus, we go cookie hunting for this page url and record all
        // those we find which hit any hostname found on this page.
        // No worry, this is async.

        // rhill 2013-11-07: Senseless to do this for behind-the-scene
        // requests.
        // rhill 2013-12-03: Do this here only for root frames.
        if ( isWebPage && tabId !== httpsb.behindTheSceneTabId ) {
            cookieHunter.recordPageCookiesAsync(pageStats);
        }

        // quickProfiler.stop('onBeforeRequestHandler');
        return;
    }

    // blacklisted
    // console.debug('onBeforeRequestHandler > blocking %s from %s', type, hostname);

    // If it's a blacklisted frame, redirect to frame.html
    // rhill 2013-11-05: The root frame contains a link to noop.css, this
    // allows to later check whether the root frame has been unblocked by the
    // user, in which case we are able to force a reload using a redirect.
    var html, dataURI;
    if ( isWebPage ) {
        html = rootFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{cssURL}}/g, httpsb.noopCSSURL);
        html = html.replace(/{{hostname}}/g, encodeURIComponent(hostname));
        html = html.replace(/{{originalURL}}/g, encodeURIComponent(requestURL));
        html = html.replace(/{{now}}/g, String(Date.now()));
        dataURI = 'data:text/html;base64,' + btoa(html);
        // quickProfiler.stop('onBeforeRequestHandler');
        return { "redirectUrl": dataURI };
    } else if ( isSubFrame ) {
        html = subFrameReplacement;
        html = html.replace(/{{fontUrl}}/g, httpsb.fontCSSURL);
        html = html.replace(/{{hostname}}/g, hostname);
        dataURI = 'data:text/html;base64,' + btoa(html);
        // quickProfiler.stop('onBeforeRequestHandler');
        return { "redirectUrl": dataURI };
    }

    // quickProfiler.stop('onBeforeRequestHandler');
    return { "cancel": true };
}

/******************************************************************************/

// This is to handle cookies leaving the browser.

function onBeforeSendHeadersHandler(details) {

    var httpsb = HTTPSB;

    // Do not ignore traffic outside tabs
    var tabId = details.tabId;
    if ( tabId < 0 ) {
        tabId = httpsb.behindTheSceneTabId;
    }

    // rhill 2013-12-16: do not interfere with apps.
    // https://github.com/gorhill/httpswitchboard/issues/91
    var pageStats = pageStatsFromTabId(tabId);
    if ( pageStats && pageStats.ignore ) {
        return;
    }

    // Any cookie in there?
    var ut = uriTools;
    var hostname = ut.hostnameFromURI(details.url);
    var pageURL = pageUrlFromTabId(tabId);
    var blacklistCookie = httpsb.blacklisted(pageURL, 'cookie', hostname);
    var processReferer = httpsb.userSettings.processReferer;

    if ( !blacklistCookie && !processReferer ) {
        return;
    }

    var headerName, fromDomain, toDomain;
    var headers = details.requestHeaders;
    var i = headers.length;
    var changed = false;

    // I am no fan of deeply indented code paths, but for performance reasons
    // I will tolerate it here. Thing is, here it is best to reuse as much
    // already computed data as possible. (also, not sure if 'switch' would be
    // a gain here, so far there is only two cases to treat).
    while ( i-- ) {
        headerName = headers[i].name.toLowerCase();
        if ( headerName === 'referer' ) {
            if ( processReferer ) {
                fromDomain = ut.domainFromURI(headers[i].value);
                toDomain = ut.domainFromHostname(hostname);
                if ( fromDomain !== toDomain ) {
                    if ( httpsb.blacklisted(pageURL, '*', hostname) ) {
                        // console.debug('onBeforeSendHeadersHandler()> nulling referer "%s" for "%s"', fromDomain, toDomain);
                        headers[i].value = '';
                        httpsb.refererHeaderFoiledCounter++;
                        changed = true;
                    }
                }
            }
            continue;
        }
        if ( headerName === 'cookie' ) {
            if ( blacklistCookie ) {
                // console.debug('HTTP Switchboard > foiled browser attempt to send cookie(s) to %o', details);
                headers.splice(i, 1);
                httpsb.cookieHeaderFoiledCounter++;
                changed = true;
            }
            continue;
        }
    }

    if ( changed ) {
        return { requestHeaders: headers };
    }
}

/******************************************************************************/

// To prevent inline javascript from being executed.

// Prevent inline scripting using `Content-Security-Policy`:
// https://dvcs.w3.org/hg/content-security-policy/raw-file/tip/csp-specification.dev.html

// This fixes:
// https://github.com/gorhill/httpswitchboard/issues/35

function onHeadersReceivedHandler(details) {

    // console.debug('onHeadersReceivedHandler()> "%s": "%s"', details.url, details.statusLine);

    var requestType = details.type;
    var isSubFrame = requestType === 'sub_frame';
    var isWebPage = requestType === 'main_frame' && details.parentFrameId < 0;

    // Ignore anything which is not a top doc or an iframe
    if ( !isWebPage && !isSubFrame ) {
        return;
    }

    // Ignore schemes other than 'http...'
    var requestURL = details.url;
    if ( requestURL.indexOf('http') !== 0 ) {
        return;
    }
    requestURL = uriTools.normalizeURI(requestURL);
    var requestHostname = uriTools.hostname();
    var requestScheme = uriTools.scheme();

    // rhill 2013-12-08: ALWAYS evaluate for javascript, do not rely too much
    // on the top page to be bound to a tab.
    // https://github.com/gorhill/httpswitchboard/issues/75

    // rhill 2013-12-07:
    // Apparently in Opera, onBeforeRequest() is triggered while the
    // URL is not yet bound to a tab (-1), which caused the code here
    // to not be able to lookup the pageStats. So let the code here bind
    // the page to a tab if not done yet.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var tabId = details.tabId;
    if ( tabId >= 0 && isWebPage ) {
        bindTabToPageStats(tabId, requestURL);
    }
    var pageStats = pageStatsFromTabId(tabId);
    var httpsb = HTTPSB;
    var headers = details.responseHeaders;

    if ( isWebPage ) {
        // rhill 2014-01-15: Report redirects.
        // https://github.com/gorhill/httpswitchboard/issues/112
        if ( details.statusLine.indexOf(' 302') > 0 ) {
            var i = headerIndexFromName('location', headers);
            if ( i >= 0 ) {
                // rhill 2014-01-20: Be ready to handle relative URLs.
                // https://github.com/gorhill/httpswitchboard/issues/162
                var locationURL = uriTools.normalizeURI(headers[i].value.trim());
                if ( uriTools.scheme() === '' ) {
                    locationURL = requestScheme + '://' + requestHostname + uriTools.path();
                }
                httpsb.redirectRequests[locationURL] = requestURL;
            }
            // console.debug('onHeadersReceivedHandler()> redirect "%s" to "%s"', requestURL, headers[i].value);
        }

        // rhill 2014-01-11: Auto-scope and/or auto-whitelist only when the
        // `main_frame` object is really received (status = 200 OK), i.e. avoid
        // redirection, because the final URL might differ. This ensures proper
        // scope is looked-up before auto-site-scoping and/or auto-whitelisting.
        // https://github.com/gorhill/httpswitchboard/issues/119
        if ( details.statusLine.indexOf(' 200') > 0 ) {
            // rhill 2014-01-15: Report redirects if any.
            // https://github.com/gorhill/httpswitchboard/issues/112
            var mainFrameStack = [requestURL];
            var destinationURL = requestURL;
            var sourceURL;
            while ( sourceURL = httpsb.redirectRequests[destinationURL] ) {
                mainFrameStack.push(sourceURL);
                delete httpsb.redirectRequests[destinationURL];
                destinationURL = sourceURL;
            }

            if ( pageStats ) {
                while ( destinationURL = mainFrameStack.pop() ) {
                    pageStats.recordRequest('main_frame', destinationURL, false);
                }
            }

            // rhill 2014-01-10: Auto-site scope?
            if ( httpsb.userSettings.autoCreateSiteScope ) {
                httpsb.autoCreateTemporarySiteScope(requestURL);
            }
            // rhill 2013-12-23: Auto-whitelist page domain?
            if ( httpsb.userSettings.autoWhitelistPageDomain ) {
                httpsb.autoWhitelistTemporarilyPageDomain(requestURL);
            }
        }
    }

    // At this point we have a top web page or a embedded web page in a frame,
    // so do not assume requestURL === pageURL.
    // Evaluate according to scope.
    // rhill 2013-12-07:
    // Worst case scenario, if no pageURL can be found for this
    // request, use global scope to evaluate whether it should be blocked
    // or allowed.
    // https://github.com/gorhill/httpswitchboard/issues/75
    var pageURL = pageStats ? pageUrlFromPageStats(pageStats) : '*';
    if ( httpsb.whitelisted(pageURL, 'script', requestHostname) ) {
        return;
    }

    // If javascript not allowed, say so through a `Content-Security-Policy`
    // directive.
    if ( isWebPage ) {
        headers.push({
            'name': 'Content-Security-Policy',
            'value': "script-src 'none'"
        });
    }
    // For inline javascript within iframes, we need to sandbox.
    // https://github.com/gorhill/httpswitchboard/issues/73
    // Now because sandbox cancels all permissions, this means
    // not just javascript is disabled. To avoid negative side
    // effects, I allow some other permissions, but...
    // TODO: Reuse CSP `sandbox` directive if it's already in the
    // headers (strip out `allow-scripts` if present),
    // and find out if the `sandbox` in the header interfere with a
    // `sandbox` attribute which might be present on the iframe.
    else {
        headers.push({
            'name': 'Content-Security-Policy',
            'value': 'sandbox allow-forms allow-same-origin'
        });
    }
    return { responseHeaders: headers };
}

/******************************************************************************/

// As per Chrome API doc, webRequest.onErrorOccurred event is the last
// one called in the sequence of webRequest events.
// http://developer.chrome.com/extensions/webRequest.html

function onErrorOccurredHandler(details) {
    // console.debug('onErrorOccurred()> "%s": %o', details.url, details);

    // Ignore all that is not a main document
    if ( details.type !== 'main_frame' || details.parentFrameId >= 0 ) {
        return;
    }

    var pageStats = pageStatsFromPageUrl(details.url);
    if ( !pageStats ) {
        return;
    }

    // rhill 2014-01-28: Unwind the stack of redirects if any. Chromium will
    // emit an error when a web page redirects apparently endlessly, so
    //  we need to unravel and report all these redirects upon error.
    // https://github.com/gorhill/httpswitchboard/issues/171
    var httpsb = HTTPSB;
    var requestURL = uriTools.normalizeURI(details.url);
    var mainFrameStack = [requestURL];
    var destinationURL = requestURL;
    var sourceURL;
    while ( sourceURL = httpsb.redirectRequests[destinationURL] ) {
        mainFrameStack.push(sourceURL);
        delete httpsb.redirectRequests[destinationURL];
        destinationURL = sourceURL;
    }

    while ( destinationURL = mainFrameStack.pop() ) {
        pageStats.recordRequest('main_frame', destinationURL, false);
    }
}

/******************************************************************************/

var webRequestHandlerRequirements = {
    'tabsBound': 0,
    'listsLoaded': 0
    };

function startWebRequestHandler(from) {
    // Do not launch traffic handler if not all requirements are fullfilled.
    // This takes care of pages being blocked when chromium is launched
    // because there is no whitelist loaded and default is to block everything.
    var o = webRequestHandlerRequirements;
    o[from] = 1;
    if ( Object.keys(o).map(function(k){return o[k];}).join().search('0') >= 0 ) {
        return;
    }

    chrome.webRequest.onBeforeRequest.addListener(
        onBeforeRequestHandler,
        {
            "urls": [
                "http://*/*",
                "https://*/*",
                "chrome-extension://*/*"
            ],
            "types": [
                "main_frame",
                "sub_frame",
                'stylesheet',
                "script",
                "image",
                "object",
                "xmlhttprequest",
                "other"
            ]
        },
        [ "blocking" ]
    );

    chrome.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeadersHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        onHeadersReceivedHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        },
        ['blocking', 'responseHeaders']
    );

    chrome.webRequest.onErrorOccurred.addListener(
        onErrorOccurredHandler,
        {
            'urls': [
                "http://*/*",
                "https://*/*"
            ]
        }
    );
}

/******************************************************************************/

// Caller must ensure headerName is normalized to lower case.

function headerIndexFromName(headerName, headers) {
    var i = headers.length;
    while ( i-- ) {
        if ( headers[i].name.toLowerCase() === headerName ) {
            return i;
        }
    }
    return -1;
}

