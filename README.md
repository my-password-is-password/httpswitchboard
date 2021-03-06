# HTTP Switchboard for Chromium

See [Change log](https://github.com/gorhill/httpswitchboard/wiki/Change-log) for latest changes.

A Chromium browser extension which let you white- or blacklist requests
originating from within a web page according to their type and/or destination
as per domain name. As of December 2013, the extension comes with preset
blacklists totaling over 45,000 distinct hostnames (these lists can be disabled,
and more can be enabled).

## Installation

Available from [Chrome web store](https://chrome.google.com/webstore/detail/httpswitchboard/mghdpehejfekicfjcdbfofhcmnjhgaag), [Opera add-ons collection](https://addons.opera.com/en-gb/extensions/details/http-switchboard/), or you can [install manually](https://github.com/gorhill/httpswitchboard/tree/master/dist). I expect the extension to work on any Chromium-based browser.

## Documentation

[More at the wiki](https://github.com/gorhill/httpswitchboard/wiki)

![HTTP Switchboard](doc/img/screenshot1.png)

HTTP Switchboard (FOSS) put you in FULL control of where your browser is allowed to connect, what type of data it is allowed to download, and what it is allowed to execute. Nobody else decides for you: You choose. You are in full control of your privacy.

* See ALL the remote connections, failed or attempted, depending on whether they were blocked or allowed (you decide).

* A single-click to whitelist/blacklist one or multiple classes of requests according to the destination and type of data (a blocked request will NEVER leave your browser).

* Efficient blacklisting: cookies won't leave your browser, javascript won't execute, plugins won't play, tracking pixels won't download, etc.

* You do not have to solely rely on just one particular curated blacklist (arguably with many missing entries) outside which nothing else can be blocked.

* Ease of use: HTTP Switchboard lets you easily whitelist/blacklist net requests which originate from within a web page according to a point-and-click matrix:

- domain names (left column)
  * from very specific
  * to very generic

- type of requests (top row)
  * cookies
  * css (stylesheets and web fonts)
  * images
  * objects
  * scripts
  * XHR (requests made by scripts)
  * frames
  * others

You can blacklist/whitelist a single cell, an entire row, a group of rows, an entire column, or the whole matrix with just one click.

HTTP Switchboard matrix uses precedence logic to evaluate what is blocked/allowed according to which cells are blacklisted/whitelisted. For example, this allows you to whitelist a whole page with one click, without having to repeatedly whitelist whatever new data appear on the page.

You can also create scopes for your whitelist/blacklist rules. For example, this allows you to whitelist `facebook.com` ONLY when visiting Facebook web site.

The goal of this extension is to make the allowing or blocking of web sites, wholly or partly, as straightforward as possible, so as to not discourage those users who give up easily on good security and privacy habits.

As of December 2013, the extension comes with preset blacklists totaling over 45,000 distinct hostnames (each list can be disabled/enabled according to your choice, and there are more preset blacklists which you can activate if you wish so.)

Ultimately, you can choose however you browse the net:

- Blacklist all by default, and whitelist as needed (default mode).
- Whitelist all by default, and blacklist as needed.

Either way, you still benefit from the preset blacklists so that at least you get basic protection from trackers, malware sites, etc. Or you can disable all of these preset blacklists.

Your choice.

HTTP Switchboard is the fruit of a personal project, there no company of any kind involved, therefore no agenda other than giving users the tools to be in complete control of their browser (I appreciate the thought, but I do not want donation, now or in the future.)

This is pre-version 1.0, more work is intended. Bugs/issues/suggestions are addressed as quickly as possible. See: <https://github.com/gorhill/httpswitchboard/issues?state=open>

You are very welcomed to contribute your views on open issues and suggestions, various arguments for/against help me in deciding what is needed to improve the extension.

Ease of use is the primary goal. I've seen users give up on Firefox's NoScript because it gets too much in the way according to them, so rather than blame these users for poor security habits, I prefer to blame developers and this project is a tentative to address the issues which cause some users to give up on basic security.

This extension is also useful to understand what the web page in your browser is doing behind the scene. You have full ability to see and decide with whom a web page communicates, and to restrict these communications to specific classes of objects within the web page.

The number which appear in the extension icon correspond to the total number of distinct requests attempted (successfully or not depending on whether these were allowed or blocked) behind the scene.

Simply click on the appropriate entry in the matrix in order to white-, black- or graylist a component. Graylisting means the blocked or allowed status will be inherited from another entry with higher precedence in the matrix.

Red square = effectively blacklisted, i.e. requests are prevented from reaching their intended destination:

- Dark red square: the domain name and/or type of request is specifically blacklisted.
- Faded red square: the blacklist status is inherited because the entry is graylisted.

Green square = effectively whitelisted, i.e. requests are allowed to reach their intended destination:

- Dark green square: the domain name and/or type of request is specifically whitelisted.
- Faded green square: the whitelist status is inherited because the entry is graylisted.

The top-left cell in the matrix represents the default global setting, which allows you to choose whether allowing or blocking everything is the default behavior. Some prefer to allow everything while blocking exceptionally. My personal preference is of course the reverse, blocking everything and allowing exceptionally.

This extension is also useful if you wish to speed up your browsing, by blocking all requests for images as an example.

## License

<a href="https://github.com/gorhill/httpswitchboard/blob/master/LICENSE.txt">GPLv3</a>.
