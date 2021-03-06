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

// rhill 2013-12-14: the whole cookie management has been rewritten so as
// to avoid having to call chrome API whenever a single cookie changes, and
// to record cookie for a web page *only* when its value changes.
// https://github.com/gorhill/httpswitchboard/issues/79

/******************************************************************************/

function chromeRemoveCookieCallback(details) {
    if ( details ) {
        var cookieKey = cookieHunter.cookieKeyFromCookieURL(details.url, details.name);
        cookieHunter.removeCookieFromDict(cookieKey);
        HTTPSB.cookieRemovedCounter++;
        // console.debug('HTTP Switchboard > removed cookie "%s"', cookieKey);
    }
}

/******************************************************************************/

var cookieHunter = {
    queuePageRecord: {},
    queuePageRemove: {},
    queueRemove: {},
    cookieDict: {},

    CookieEntry: function(cookie) {
        this.secure = cookie.secure;
        this.session = cookie.session;
        this.anySubdomain = cookie.domain.charAt(0) === '.';
        this.domain = this.anySubdomain ? cookie.domain.slice(1) : cookie.domain;
        this.path = cookie.path;
        this.name = cookie.name;
        this.value = cookie.value;
        this.tstamp = Date.now();
        // Some cookies must be left alone:
        // https://github.com/gorhill/httpswitchboard/issues/19
        this.ignore = HTTPSB.excludeRegex.test(cookieHunter.cookieURLFromCookieEntry(this));
    },

    // Fill the cookie dictionary
    init: function() {
        this.queuePageRemove = {};
        this.queueRemove = {};
        this.cookieDict = {};
        chrome.cookies.getAll({}, function(cookies) {
            var i = cookies.length;
            while ( i-- ) {
                cookieHunter.addCookieToDict(cookies[i]);
            }
        });
    },

    addCookieToDict: function(cookie) {
        var cookieKey = this.cookieKeyFromCookie(cookie);
        if ( !this.cookieDict[cookieKey] ) {
            this.cookieDict[cookieKey] = new this.CookieEntry(cookie);
        }
        return this.cookieDict[cookieKey];
    },

    removeCookieFromDict: function(cookieKey) {
        delete this.cookieDict[cookieKey];
    },

    cookieKeyFromCookie: function(cookie) {
        var cookieKey = cookie.secure ? 'https://' : 'http://';
        cookieKey += cookie.domain.charAt(0) === '.' ? cookie.domain.slice(1) : cookie.domain;
        cookieKey += cookie.path;
        cookieKey += '{cookie:' + cookie.name + '}';
        return cookieKey;
    },

    cookieEntryFromCookieKey: function(cookieKey) {
        return this.cookieDict[cookieKey];
    },

    cookieEntryFromCookie: function(cookie) {
        return this.cookieEntryFromCookieKey(this.cookieKeyFromCookie(cookie));
    },

    cookieURLFromCookieEntry: function(entry) {
        if ( !entry ) {
            return '';
        }
        return (entry.secure ? 'https://' : 'http://') + entry.domain + entry.path;
    },

    cookieKeyFromCookieURL: function(url, name) {
        return uriTools.uri(url).assemble(uriTools.schemeBit |
               uriTools.hostnameBit |
               uriTools.pathBit) + '{cookie:' + name + '}';
    },

    cookieMatchDomains: function(cookieKey, domains) {
        var cookieEntry = this.cookieDict[cookieKey];
        if ( !cookieEntry ) {
            return false;
        }
        if ( domains.indexOf(' ' + cookieEntry.domain + ' ') < 0 ) {
            if ( !cookieEntry.anySubdomain ) {
                return false;
            }
            if ( domains.indexOf('.' + cookieEntry.domain + ' ') < 0 ) {
                return false;
            }
        }
        return true;
    },

    // Look for cookies to record for a specific web page
    recordPageCookiesAsync: function(pageStats) {
        // Store the page stats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( !pageStats ) {
            return;
        }
        var pageURL = pageUrlFromPageStats(pageStats);
        this.queuePageRecord[pageURL] = pageStats;
        asyncJobQueue.add(
            'cookieHunterPageRecord',
            null,
            function() { cookieHunter.processPageRecordQueue(); },
            1000,
            false);
    },

    recordPageCookie: function(pageStats, cookieKey) {
        var httpsb = HTTPSB;
        var cookieEntry = this.cookieEntryFromCookieKey(cookieKey);
        var pageURL = pageStats.pageUrl;
        var block = httpsb.blacklisted(pageURL, 'cookie', cookieEntry.domain);

        // rhill 2013-11-20:
        // https://github.com/gorhill/httpswitchboard/issues/60
        // Need to URL-encode cookie name
        pageStats.recordRequest('cookie',
                                this.cookieURLFromCookieEntry(cookieEntry) + '{cookie:' + encodeURIComponent(cookieEntry.name) + '}',
                                block);
        httpsb.requestStats.record('cookie', block);

        // rhill 2013-11-21:
        // https://github.com/gorhill/httpswitchboard/issues/65
        // Leave alone cookies from behind-the-scene requests if
        // behind-the-scene processing is disabled.
        if ( !block ) {
            return;
        }
        if ( !httpsb.userSettings.deleteCookies ) {
            return;
        }
        this.removeCookieAsync(cookieKey);
    },

    // Look for cookies to potentially remove for a specific web page
    removePageCookiesAsync: function(pageStats) {
        // Hold onto pageStats objects so that it doesn't go away
        // before we handle the job.
        // rhill 2013-10-19: pageStats could be nil, for example, this can
        // happens if a file:// ... makes an xmlHttpRequest
        if ( !pageStats ) {
            return;
        }
        var pageURL = pageUrlFromPageStats(pageStats);
        this.queuePageRemove[pageURL] = pageStats;
        asyncJobQueue.add(
            'cookieHunterPageRemove',
            null,
            function() { cookieHunter.processPageRemoveQueue(); },
            15 * 1000,
            false);
    },

    // Candidate for removal
    removeCookieAsync: function(cookieKey) {
        this.queueRemove[cookieKey] = true;
    },

    processPageRecordQueue: function() {
        for ( var pageURL in this.queuePageRecord ) {
            if ( !this.queuePageRecord.hasOwnProperty(pageURL) ) {
                continue;
            }
            this.findAndRecordPageCookies(this.queuePageRecord[pageURL]);
            delete this.queuePageRecord[pageURL];
        }
    },

    processPageRemoveQueue: function() {
        for ( var pageURL in this.queuePageRemove ) {
            if ( !this.queuePageRemove.hasOwnProperty(pageURL) ) {
                continue;
            }
            this.findAndRemovePageCookies(this.queuePageRemove[pageURL]);
            delete this.queuePageRemove[pageURL];
        }
    },

    // Effectively remove cookies.
    processRemoveQueue: function() {
        var httpsb = HTTPSB;

        // Remove only some of the cookies which are candidate for removal:
        // who knows, maybe a user has 1000s of cookies sitting in his
        // browser...
        var cookieKeys = Object.keys(this.queueRemove);
        if ( cookieKeys.length > 50 ) {
            cookieKeys = cookieKeys.sort(function(){return Math.random() < 0.5;}).splice(0, 50);
        }

        var cookieKey, cookieEntry;
        while ( cookieKey = cookieKeys.pop() ) {
            delete this.queueRemove[cookieKey];

            cookieEntry = this.cookieEntryFromCookieKey(cookieKey);

            // Just in case setting was changed after cookie was put in queue.
            if ( !httpsb.userSettings.deleteCookies ) {
                continue;
            }

            // Some cookies must be left alone:
            // https://github.com/gorhill/httpswitchboard/issues/19
            if ( cookieEntry.ignore ) {
                continue;
            }

            // Ensure cookie is not allowed on ALL current web pages: It can
            // happen that a cookie is blacklisted on one web page while
            // being whitelisted on another (because of per-page permissions).
            if ( !this.canRemoveCookie(cookieKey) ) {
                continue;
            }

            var url = this.cookieURLFromCookieEntry(cookieEntry);
            if ( !url ) {
                continue;
            }

            // console.debug('HTTP Switchboard > cookieHunter.processRemoveQueue(): removing %s{%s}', url, cookieEntry.name);
            chrome.cookies.remove({
                url: url,
                name: cookieEntry.name
            }, chromeRemoveCookieCallback);
        }
    },

    // Once in a while, we go ahead and clean everything that might have been
    // left behind.
    processClean: function() {
        var httpsb = HTTPSB;
        var userSettings = httpsb.userSettings;
        var deleteCookies = userSettings.deleteCookies;
        var deleteUnusedSessionCookies = userSettings.deleteUnusedSessionCookies;
        var deleteUnusedSessionCookiesAfter = userSettings.deleteUnusedSessionCookiesAfter * 60 * 1000;
        var now = Date.now();
        var entry;
        var cookieDict = this.cookieDict;
        for ( var cookieKey in cookieDict ) {
            if ( !cookieDict.hasOwnProperty(cookieKey) ) {
                continue;
            }
            entry = cookieDict[cookieKey];
            // Some cookies must be left alone:
            // https://github.com/gorhill/httpswitchboard/issues/19
            if ( entry.ignore ) {
                continue;
            }
            // User might want session cookies to be deleted, even if they are
            // whitelisted.
            // rhill 2013-12-15: use global scope, or else if a cookie was
            // created from a site-scoped hostname, the cookie will never be
            // deleted when the site-scope no longer exists.
            // Ultimately, canRemoveCookie() will prevent deletion if the
            // site-scope still exists.
            if ( httpsb.whitelisted('*' /* this.cookieURLFromCookieEntry(entry) */, 'cookie', entry.domain) ) {
                if ( !entry.session ) {
                    continue;
                }
                if ( !deleteUnusedSessionCookies ) {
                    continue;
                }
                if ( (now - entry.session.tstamp) < deleteUnusedSessionCookiesAfter ) {
                    continue;
                }
            }
            // User doesn't want HTTPSB to delete cookies.
            else if ( !deleteCookies ) {
                continue;
            }
            // This takes care of stale cookies which are left unattended for more
            // than 2hr, so at least we give a chance to extensions which might
            // rely on some cookies.
            else if ( (now - entry.session.tstamp) < 7200000 /* 2hr */ ) {
                continue;
            }
            this.removeCookieAsync(cookieKey);
        }
    },

    findAndRecordPageCookies: function(pageStats) {
        var domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
        for ( var cookieKey in this.cookieDict ) {
            if ( !this.cookieDict.hasOwnProperty(cookieKey) ) {
                continue;
            }
            if ( !this.cookieMatchDomains(cookieKey, domains) ) {
                continue;
            }
            this.recordPageCookie(pageStats, cookieKey);
        }
    },

    findAndRemovePageCookies: function(pageStats) {
        var domains = ' ' + Object.keys(pageStats.domains).join(' ') + ' ';
        for ( var cookieKey in this.cookieDict ) {
            if ( !this.cookieDict.hasOwnProperty(cookieKey, domains) ) {
                continue;
            }
            if ( !this.cookieMatchDomains(cookieKey, domains) ) {
                continue;
            }
            this.removeCookieAsync(cookieKey);
        }
    },

    // Check all scopes to ensure none of them fulfill the following
    // conditions:
    // - The hostname of the target cookie matches the hostname of the scope
    // - The target cookie is allowed in the scope
    // Check all pages to ensure none of them fulfill both following
    // conditions:
    // - refers to the target cookie
    // - the target cookie is is allowed
    // If one of the above set of conditions is fulfilled at least once,
    // the cookie can NOT be removed.
    // TODO: cache the joining of hostnames into a single string for search
    // purpose. 
    canRemoveCookie: function(cookieKey) {
        var entry = this.cookieEntryFromCookieKey(cookieKey);
        if ( !entry ) {
            return false;
        }
        // If a session cookie is in the remove queue, it is assumed it
        // needs to be removed unconditonally.
        if ( entry.session ) {
            return true;
        }
        var cookieDomain = entry.domain;
        var anySubdomain = entry.anySubdomain;
        var httpsb = HTTPSB;

        // rhill 2014-01-11: Do not delete cookies which are whitelisted
        // in at least one scope. Limitation: this can be done only
        // for cookies which domain matches domain of scope. This is
        // because a scope with whitelist *|* would cause all cookies to not
        // be removable.
        // https://github.com/gorhill/httpswitchboard/issues/126
        var scopes = httpsb.temporaryScopes.scopes;
        var scopeDomain;
        for ( var scopeKey in scopes ) {
            if ( !scopes.hasOwnProperty(scopeKey) ) {
                continue;
            }
            // Cookie related to scope domain?
            if ( !httpsb.isGlobalScopeKey(scopeKey) ) {
                scopeDomain = scopeKey.replace(/^https?:\/\/(\*\.)?/, '');
                if ( anySubdomain ) {
                    if ( scopeDomain.slice(0 - cookieDomain.length) !== cookieDomain ) {
                        continue;
                    }
                } else if ( scopeDomain !== cookieDomain ) {
                    continue;
                }
            }
            if ( scopes[scopeKey].evaluate('cookie', cookieDomain).charAt(0) === 'g' ) {
                // console.log('cookieHunter.canRemoveCookie()> can NOT remove "%s" because of scope "%s"', cookieKey, scopeKey);
                return false;
            }
        }

        // If we reach this point, we will check whether the cookie is actually
        // in use for a currently opened web page. This is necessary to
        // prevent the deletion of 3rd-party cookies which might be whitelisted
        // for a currently opened web page.
        var pageStats = httpsb.pageStats;
        for ( var pageURL in pageStats ) {
            if ( !pageStats.hasOwnProperty(pageURL) ) {
                continue;
            }
            if ( !this.cookieMatchDomains(cookieKey, ' ' + Object.keys(pageStats[pageURL].domains).join(' ') + ' ') ) {
                continue;
            }
            // rhill 2013-12-16: it's an app, do not delete the cookie it
            // might be using.
            // https://github.com/gorhill/httpswitchboard/issues/91
            if ( pageStats.ignore ) {
                // console.log('cookieHunter.canRemoveCookie()> can NOT remove "%s" because of ignore "%s"', cookieKey, pageURL);
                return false;
            }
            if ( httpsb.whitelisted(pageURL, 'cookie', cookieDomain) ) {
                return false;
            }
        }

       // console.log('cookieHunter.canRemoveCookie()> can remove "%s"', cookieKey);
       return true;
    }
};

/******************************************************************************/

function cookieHunterRemoveCallback() {
    cookieHunter.processRemoveQueue();
}
asyncJobQueue.add('cookieHunterRemove', null, cookieHunterRemoveCallback, 2 * 60 * 1000, true);

function cookieHunterCleanCallback() {
    cookieHunter.processClean();
}
asyncJobQueue.add('cookieHunterClean', null, cookieHunterCleanCallback, 15 * 60 * 1000, true);

/******************************************************************************/

// Listen to any change in cookieland, we will update page stats accordingly.

function cookieChangedHandler(changeInfo) {
    if ( changeInfo.removed ) {
        return;
    }

    var cookie = changeInfo.cookie;
    var ch = cookieHunter;

    // rhill 2013-12-11: If cookie value didn't change, no need to record.
    // https://github.com/gorhill/httpswitchboard/issues/79
    var cookieKey = ch.cookieKeyFromCookie(cookie);
    var cookieEntry = ch.cookieEntryFromCookieKey(cookieKey);
    if ( !cookieEntry ) {
        cookieEntry = ch.addCookieToDict(cookie);
    } else {
        cookieEntry.tstamp = Date.now();
        if ( cookie.value === cookieEntry.value ) {
            return;
        }
        cookieEntry.value = cookie.value;
    }

    // Go through all pages and update if needed, as one cookie can be used
    // by many web pages, so they need to be recorded for all these pages.
    var allPageStats = HTTPSB.pageStats;
    var pageStats;
    for ( var pageURL in allPageStats ) {
        if ( !allPageStats.hasOwnProperty(pageURL) ) {
            continue;
        }
        pageStats = allPageStats[pageURL];
        if ( !ch.cookieMatchDomains(cookieKey, ' ' + Object.keys(pageStats.domains).join(' ') + ' ') ) {
            continue;
        }
        ch.recordPageCookie(pageStats, cookieKey);
    }
}

/******************************************************************************/

cookieHunter.init();
chrome.cookies.onChanged.addListener(cookieChangedHandler);

