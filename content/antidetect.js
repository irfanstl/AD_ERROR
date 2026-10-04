// Runs in the page's own JS world at document_start.
// 1) Gives anti-adblock detectors the objects they expect, so ad-free pages
//    don't think a blocker is present.
// 2) Stops popups and script-driven forced redirects.
(function () {
  "use strict";

  // ---------- 1. Anti-adblock-detection ----------
  const def = (obj, key, value) => {
    try {
      Object.defineProperty(obj, key, {
        value,
        writable: true,
        configurable: true
      });
    } catch (_) {}
  };

  // Ad scripts normally define these; detectors check for them.
  if (!window.adsbygoogle) def(window, "adsbygoogle", { loaded: true, push() {} });
  def(window, "canRunAds", true);
  def(window, "google_ad_client", window.google_ad_client || "ca-pub-0");

  if (!window.googletag) {
    const chain = {
      addService: () => chain,
      defineSlot: () => chain,
      defineOutOfPageSlot: () => chain,
      setTargeting: () => chain,
      enableServices() {},
      display() {},
      pubads: () => chain,
      disableInitialLoad() {},
      enableSingleRequest() {},
      collapseEmptyDivs() {},
      refresh() {},
      addEventListener() {},
      getSlots: () => []
    };
    def(window, "googletag", { cmd: [], ...chain, apiReady: true });
    window.googletag.cmd.push = (fn) => {
      try { typeof fn === "function" && fn(); } catch (_) {}
      return 1;
    };
  }

  // FuckAdBlock / BlockAdBlock style libraries: report "not detected".
  const fakeDetector = function () {
    const api = {
      onDetected: () => api,
      onNotDetected(fn) { try { setTimeout(fn, 0); } catch (_) {} return api; },
      on(detected, fn) { if (!detected) { try { setTimeout(fn, 0); } catch (_) {} } return api; },
      check: () => true,
      setOption: () => api,
      emitEvent: () => api,
      clearEvent: () => api,
      _options: {}
    };
    return api;
  };
  ["fuckAdBlock", "blockAdBlock", "sniffAdBlock"].forEach((name) => {
    if (!window[name]) def(window, name, fakeDetector());
  });
  ["FuckAdBlock", "BlockAdBlock"].forEach((name) => {
    if (!window[name]) def(window, name, fakeDetector);
  });

  // Bait requests: a detector fetches an ad-looking URL and sees if it fails.
  // Make those probes look successful.
  const BAIT = /(pagead\/js\/adsbygoogle|ads\.js|adframe|adsbox|banner_ad|ad-banner|doubleclick\.net|showads)/i;
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        const url = typeof input === "string" ? input : input && input.url;
        if (url && BAIT.test(url) && init && init.mode === "no-cors") {
          return origFetch.apply(this, arguments).catch(() =>
            new Response("", { status: 200 })
          );
        }
      } catch (_) {}
      return origFetch.apply(this, arguments);
    };
  }

  // ---------- 2. Popup and redirect blocking ----------
  let lastTrustedClick = 0;
  window.addEventListener(
    "click",
    (e) => { if (e.isTrusted) lastTrustedClick = Date.now(); },
    true
  );
  window.addEventListener(
    "keydown",
    (e) => { if (e.isTrusted) lastTrustedClick = Date.now(); },
    true
  );

  const note = () => {
    try { window.postMessage({ __adshield: "blocked" }, "*"); } catch (_) {}
  };

  // Sign-in popups that are legitimate and should keep working.
  const AUTH_HOSTS = /(^|\.)(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|github\.com|facebook\.com|twitter\.com|x\.com|discord\.com|paypal\.com|stripe\.com|auth0\.com|okta\.com)$/i;

  const realOpen = window.open;
  window.open = function (url, target, features) {
    let host = "";
    try { host = new URL(url, location.href).hostname; } catch (_) {}

    // Same-site and sign-in popups are allowed (still needs a real gesture).
    const allowed = !host || sameSiteHost(host) || AUTH_HOSTS.test(host);
    const recentGesture = Date.now() - lastTrustedClick < 1000;
    const active =
      navigator.userActivation && navigator.userActivation.isActive;

    // Ad networks open a cross-site tab when you click the video player or
    // page. A click gives them a "gesture", so gesture alone is not enough.
    if (!allowed || (!recentGesture && !active)) {
      note();
      return null;
    }
    // Pop-unders: sized tiny or sent behind.
    if (features && /width=\s*[01]\b|height=\s*[01]\b/i.test(features)) {
      note();
      return null;
    }
    return realOpen.apply(this, arguments);
  };

  function sameSiteHost(h) {
    const a = h.split(".").slice(-2).join(".");
    const b = location.hostname.split(".").slice(-2).join(".");
    return a === b;
  }

  // Scripts that create a hidden <a target=_blank> and click() it, or
  // submit a hidden form into a new tab.
  const realAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    try {
      const t = (this.target || "").toLowerCase();
      if ((t === "_blank" || t === "_new") && this.href) {
        const h = new URL(this.href, location.href).hostname;
        if (!sameSiteHost(h) && !AUTH_HOSTS.test(h)) {
          note();
          return;
        }
      }
    } catch (_) {}
    return realAnchorClick.apply(this, arguments);
  };

  const realDispatch = EventTarget.prototype.dispatchEvent;
  EventTarget.prototype.dispatchEvent = function (ev) {
    try {
      if (
        this instanceof HTMLAnchorElement &&
        ev && ev.type === "click" && !ev.isTrusted &&
        (this.target || "").toLowerCase() === "_blank" &&
        this.href
      ) {
        const h = new URL(this.href, location.href).hostname;
        if (!sameSiteHost(h) && !AUTH_HOSTS.test(h)) {
          note();
          return false;
        }
      }
    } catch (_) {}
    return realDispatch.apply(this, arguments);
  };

  const realSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    try {
      const t = (this.target || "").toLowerCase();
      if (t === "_blank" || t === "_new") {
        const h = new URL(this.action || location.href, location.href).hostname;
        if (!sameSiteHost(h) && !AUTH_HOSTS.test(h)) {
          note();
          return;
        }
      }
    } catch (_) {}
    return realSubmit.apply(this, arguments);
  };

  // Links that open a new tab on click anywhere on the page (click-hijack).
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest && e.target.closest("a[target=_blank]");
      if (!a) return;
      const style = getComputedStyle(a);
      const invisible =
        style.opacity === "0" ||
        (a.offsetWidth * a.offsetHeight > 0 &&
          a.offsetWidth >= innerWidth * 0.9 &&
          a.offsetHeight >= innerHeight * 0.9 &&
          style.position === "fixed");
      if (invisible) {
        e.preventDefault();
        e.stopImmediatePropagation();
        note();
      }
    },
    true
  );

  // Forced redirect: block navigation that fires without any user gesture
  // shortly after load, when it goes to a different site.
  const loadedAt = Date.now();
  const sameSite = (u) => {
    try {
      const t = new URL(u, location.href);
      const a = t.hostname.split(".").slice(-2).join(".");
      const b = location.hostname.split(".").slice(-2).join(".");
      return a === b;
    } catch (_) { return true; }
  };
  const guard = (fn, urlArg) =>
    function () {
      const url = arguments[urlArg];
      const gesture = Date.now() - lastTrustedClick < 1500;
      if (url && !gesture && !sameSite(url) && Date.now() - loadedAt < 15000) {
        note();
        return;
      }
      return fn.apply(this, arguments);
    };

  try {
    Location.prototype.assign = guard(Location.prototype.assign, 0);
    Location.prototype.replace = guard(Location.prototype.replace, 0);
  } catch (_) {}

  // Meta-refresh redirects to other sites.
  new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (
          n.nodeType === 1 &&
          n.tagName === "META" &&
          /refresh/i.test(n.httpEquiv || "")
        ) {
          const target = (n.content || "").split(/url=/i)[1];
          if (target && !sameSite(target.trim())) {
            n.remove();
            note();
          }
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
})();
