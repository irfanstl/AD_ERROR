// Isolated-world content script: hides ad containers, removes
// "please disable your adblocker" walls, and restores page scrolling.
(function () {
  "use strict";

  // Counts popups blocked by the page-world script.
  window.addEventListener("message", (e) => {
    if (e.source === window && e.data && e.data.__adshield === "blocked") {
      try { chrome.runtime.sendMessage({ type: "countBlocked", n: 1 }); } catch (_) {}
    }
  });

  chrome.storage.local.get("enabled", ({ enabled = true }) => {
    if (!enabled) return;
    start();
  });

  function start() {
    // Deliberately NOT hiding class names that anti-adblock scripts use as
    // bait (adsbox, ad-banner, textads, ...). Hiding those trips detection.
    const selectors = [
      "ins.adsbygoogle",
      "iframe[src*='doubleclick.net']",
      "iframe[src*='googlesyndication.com']",
      "iframe[src*='adnxs.com']",
      "[id^='google_ads_iframe']",
      "[id^='div-gpt-ad']",
      "[data-ad-slot]",
      "[data-google-query-id]",
      ".taboola, [id^='taboola-']",
      ".OUTBRAIN, [data-widget-id^='AR_']",
      "[class*='sponsored-content']",
      "[id*='popunder']",
      "[class*='popunder']"
    ];

    const style = document.createElement("style");
    style.textContent =
      selectors.join(",\n") +
      " { display: none !important; visibility: hidden !important; }";
    (document.head || document.documentElement).appendChild(style);

    const WALL_TEXT =
      /(ad\s?-?block(er)?|ad\s?-?blocking|disable (your )?(ad|ads)|turn off (your )?(ad|ads)|whitelist (us|this site)|ad\s?-?free experience)/i;

    function restoreScroll() {
      for (const el of [document.documentElement, document.body]) {
        if (!el) continue;
        if (getComputedStyle(el).overflow === "hidden") {
          el.style.setProperty("overflow", "auto", "important");
        }
        el.style.setProperty("filter", "none", "important");
      }
    }

    function looksLikeWall(el) {
      if (!(el instanceof HTMLElement)) return false;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "absolute") return false;
      const r = el.getBoundingClientRect();
      const bigEnough =
        r.width > innerWidth * 0.5 && r.height > innerHeight * 0.3;
      if (!bigEnough) return false;
      const text = (el.innerText || "").slice(0, 600);
      return WALL_TEXT.test(text);
    }

    function sweep() {
      let removed = false;
      document.querySelectorAll("body *").forEach((el) => {
        if (looksLikeWall(el)) {
          el.remove();
          removed = true;
        }
      });
      // Dimmed backdrops left behind by the wall.
      document
        .querySelectorAll("[class*='backdrop'],[class*='overlay'],[class*='modal-bg']")
        .forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.position === "fixed" && el.getBoundingClientRect().width >= innerWidth * 0.9 && !el.innerText.trim()) {
            if (removed) el.remove();
          }
        });
      if (removed) restoreScroll();
    }

    let timer = null;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; sweep(); }, 400);
    };

    const startObserver = () => {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      sweep();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    } else {
      startObserver();
    }
  }
})();
