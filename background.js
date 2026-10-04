// AdShield background service worker
// - Closes popup/pop-under tabs opened by a page toward known ad domains
// - Tracks per-tab blocked counts and the on/off switch

const AD_DOMAINS = [
  "doubleclick.net", "googleadservices.com", "adnxs.com", "adsrvr.org",
  "taboola.com", "outbrain.com", "criteo.com", "popads.net", "popcash.net",
  "propellerads.com", "exoclick.com", "juicyads.com", "adsterra.com",
  "hilltopads.net", "clickadu.com", "trafficjunky.net", "ad-maven.com",
  "onclkds.com", "monetag.com", "adcash.com", "bidvertiser.com", "mgid.com",
  "revcontent.com", "richpush.co", "pushame.com", "hai8g.com",
  "agnesmooing.cfd", "oclasrv.com", "onclickads.net", "onclickmega.com",
  "propellerclick.com", "propellerpops.com"
];

// URL fragments that mark ad-network click chains regardless of domain.
const AD_URL_PATTERNS = [
  /\/afu\.php\?zoneid=/i,
  /[?&]prop_zone_id=/i,
  /[?&]utm_source=propeller/i,
  /\/cx\/[A-Za-z0-9_*-]{80,}/
];

const RULESET_ID = "ads";

function isAdHost(url) {
  try {
    const host = new URL(url).hostname;
    if (AD_DOMAINS.some((d) => host === d || host.endsWith("." + d))) return true;
    return AD_URL_PATTERNS.some((re) => re.test(url));
  } catch (_) {
    return false;
  }
}

async function getEnabled() {
  const { enabled = true } = await chrome.storage.local.get("enabled");
  return enabled;
}

async function applyEnabled(enabled) {
  await chrome.declarativeNetRequest.updateEnabledRulesets(
    enabled
      ? { enableRulesetIds: [RULESET_ID] }
      : { disableRulesetIds: [RULESET_ID] }
  );
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#888888" });
}

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ enabled: true, popupsBlocked: 0, blockCategories: true });
  await applyEnabled(true);
});

chrome.runtime.onStartup.addListener(async () => {
  await applyEnabled(await getEnabled());
});

// ---------- Adult & gambling: redirect-only blocking ----------
// These sites are NOT blocked outright. They are blocked only when you land
// on them through a popup, a new tab opened by a page, or a redirect.
// Typing the address, using a bookmark, or clicking a link in the same tab
// still works.

let categorySetPromise = null;
function loadCategorySet() {
  if (!categorySetPromise) {
    categorySetPromise = fetch(chrome.runtime.getURL("rules/category_domains.json"))
      .then((r) => r.json())
      .then((list) => new Set(list))
      .catch(() => new Set());
  }
  return categorySetPromise;
}

async function inCategory(url) {
  try {
    const parts = new URL(url).hostname.toLowerCase().split(".");
    const set = await loadCategorySet();
    for (let i = 0; i < parts.length - 1; i++) {
      if (set.has(parts.slice(i).join("."))) return true;
    }
  } catch (_) {}
  return false;
}

async function getCategoryEnabled() {
  const { blockCategories = true } = await chrome.storage.local.get("blockCategories");
  return blockCategories;
}

async function bump() {
  const { popupsBlocked = 0 } = await chrome.storage.local.get("popupsBlocked");
  await chrome.storage.local.set({ popupsBlocked: popupsBlocked + 1 });
}

// Should a tab opened by another page, heading to this URL, be closed?
async function shouldCloseOpenedTab(url) {
  if (!url) return false;
  if (isAdHost(url)) return true;
  return (await getCategoryEnabled()) && (await inCategory(url));
}

// Close tabs that a page opened toward an ad network or a blocked category.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!(await getEnabled())) return;
  if (tab.openerTabId == null) return;
  if (await shouldCloseOpenedTab(tab.pendingUrl || tab.url || "")) {
    try { await chrome.tabs.remove(tab.id); await bump(); } catch (_) {}
  }
});

// Catch tabs that start blank and navigate there a moment later.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!info.url) return;
  if (!(await getEnabled())) return;
  if (tab.openerTabId != null && (await shouldCloseOpenedTab(info.url))) {
    try { await chrome.tabs.remove(tabId); await bump(); } catch (_) {}
  }
});

// Same-tab redirects into a blocked category (script or server redirects).
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  if (!(await getEnabled()) || !(await getCategoryEnabled())) return;
  const q = d.transitionQualifiers || [];
  const redirected = q.includes("client_redirect") || q.includes("server_redirect");
  if (!redirected) return; // typed, bookmarked, reloaded or plainly clicked: allow
  if (!(await inCategory(d.url))) return;
  try {
    const tab = await chrome.tabs.get(d.tabId);
    if (tab.openerTabId != null) {
      await chrome.tabs.remove(d.tabId);
    } else {
      try { await chrome.tabs.goBack(d.tabId); }
      catch (_) { await chrome.tabs.update(d.tabId, { url: "chrome://newtab" }); }
    }
    await bump();
  } catch (_) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getState") {
    (async () => {
      const { enabled = true, popupsBlocked = 0, blockCategories = true } =
        await chrome.storage.local.get(["enabled", "popupsBlocked", "blockCategories"]);
      sendResponse({ enabled, popupsBlocked, blockCategories });
    })();
    return true;
  }
  if (msg && msg.type === "setCategories") {
    (async () => {
      await chrome.storage.local.set({ blockCategories: !!msg.value });
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg && msg.type === "setEnabled") {
    (async () => {
      await chrome.storage.local.set({ enabled: !!msg.enabled });
      await applyEnabled(!!msg.enabled);
      sendResponse({ ok: true });
    })();
    return true;
  }
  if (msg && msg.type === "countBlocked") {
    (async () => {
      const { popupsBlocked = 0 } = await chrome.storage.local.get("popupsBlocked");
      await chrome.storage.local.set({ popupsBlocked: popupsBlocked + (msg.n || 1) });
    })();
  }
});
