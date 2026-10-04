# AdShield – Ad & Redirect Blocker

A Manifest V3 Chrome extension that blocks ads, popups, pop-unders and forced redirects, and keeps working on sites that try to detect ad blockers.

> **Status:** syntax-checked but not yet tested in a live Chrome session. Expect to tune it on the sites you actually use.

## Install

1. Unzip `adshield.zip`.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `adshield` folder.
4. Pin the AdShield icon from the puzzle-piece menu if you want quick access to the switches.

To update, remove the old AdShield from `chrome://extensions` and load the new folder. Reload any open pages afterwards.

Chrome will ask you to approve these permissions:

| Permission | Why it is needed |
|---|---|
| `declarativeNetRequest` | Blocks ad requests at the network level |
| `tabs` | Closes popup and pop-under tabs |
| `webNavigation` | Detects redirects into blocked categories |
| `storage` | Remembers your on/off settings and the blocked counter |
| Access to all sites | Lets the page-level scripts run everywhere |

## What it does

**Ad blocking**
- About 39,500 ad, tracker and malware domains from [StevenBlack's hosts list](https://github.com/StevenBlack/hosts), plus a hand-picked set of ad networks and URL patterns.
- Google's `adsbygoogle.js` and `gpt.js` are swapped for harmless stubs so pages that wait for them do not break.
- Ad containers are hidden on the page. Class names that anti-adblock scripts use as bait (such as `adsbox`) are deliberately left alone.

**Popup and redirect blocking**
- `window.open` is allowed only for the same site or known sign-in services (Google, Apple, Microsoft, GitHub and similar). A click alone is not treated as permission, because ad networks trigger popups from clicks on video players.
- Hidden links, script-made `click()` calls and hidden forms aimed at another site in a new tab are blocked.
- Cross-site `location.assign` / `location.replace` redirects with no click, and meta-refresh redirects to other sites, are blocked.
- Tabs opened toward an ad domain are closed automatically.
- Known click-chain patterns (for example `afu.php?zoneid=`, `prop_zone_id=`, `utm_source=propeller`) are blocked whatever the domain.

**Sites that detect ad blockers**
- Supplies the objects detectors look for (`adsbygoogle`, `googletag`, `canRunAds`).
- Answers "no blocker found" for FuckAdBlock / BlockAdBlock style libraries.
- Removes "please disable your adblocker" overlays and restores page scrolling.

**Adult and gambling redirects (about 52,000 domains)**

These sites are not blocked outright. They are blocked only when a popup or redirect sends you there:
- A new tab opened by a page toward one of them is closed.
- A redirect into one in the same tab is reversed (back one page, or to a new tab).
- Typing the address, using a bookmark, reloading, or clicking a link in the same tab all work normally.

## The popup

Click the toolbar icon for:
- **Main switch** – turns all blocking on or off.
- **Block adult & gambling redirects** – turns the category blocking on or off.
- **Counter** – popups and redirects blocked so far.

## Project layout

```
adshield/
├── manifest.json              Extension manifest (MV3)
├── background.js              Closes popup tabs, handles redirects, stores settings
├── content/
│   ├── antidetect.js          Page-world script: anti-adblock bait, popup/redirect guards
│   └── cosmetic.js            Hides ad containers, removes anti-adblock walls
├── rules/
│   ├── ads.json               Network block rules (49 rules, about 39,500 domains)
│   └── category_domains.json  Adult/gambling domains used for redirect-only blocking
├── stubs/noop.js              Stand-in for blocked ad scripts
└── popup/                     Toolbar popup (HTML, CSS, JS)
```

## Known limits

- **Cat and mouse.** Ad networks rotate domains constantly, and sites with strong anti-adblock (some video and news sites) update their detection often. Something will slip through now and then.
- **Lists are a snapshot** from 4 October 2026 and do not update themselves.
- **Opening a category site in a new tab from a link** (for example, ctrl-click from search results) is treated like a popup and closed. A normal click in the same tab works. Turn the category switch off if this bothers you.
- **Redirect blocking is heuristic.** It can occasionally block a legitimate cross-site redirect, such as some login flows. Use the main switch to turn everything off for a moment.
- **No per-site allowlist yet.**

## Troubleshooting

- **A site is broken:** turn the main switch off, reload, and see if it works. If so, tell me the site and which part broke.
- **A new ad or redirect gets through:** note the full URL it lands on and add the domain to `rules/ads.json` (inside a `requestDomains` list) and to `AD_DOMAINS` in `background.js`, then reload the extension from `chrome://extensions`.
- **Blocking seems off after an update:** reload the extension from `chrome://extensions` and refresh the page.

## Credits

Domain lists derived from [StevenBlack/hosts](https://github.com/StevenBlack/hosts) (MIT licence).
