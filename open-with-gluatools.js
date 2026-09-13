
(() => {
  "use strict";

  if (window.__OPEN_WITH_GLUATOOLS_PLUGIN__) return;
  window.__OPEN_WITH_GLUATOOLS_PLUGIN__ = true;

  const PLUGIN_ID = "open-with-gluatools";
  const BUTTON_ID = "gluatools-open-game";
  const STYLE_ID = "gluatools-open-game-style";
  const FALLBACK_ID = "gluatools-open-game-fallback";

  let lastAppId = null;
  let lastUrl = location.href;
  let observer = null;
  let refreshTimer = null;

  const log = (...args) => console.log("[OpenWithGLuaTools]", ...args);

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID},
      #${FALLBACK_ID} {
        box-sizing: border-box;
        font-family: "Motiva Sans", "Segoe UI", sans-serif;
      }

      .glt-open-btn {
        appearance: none;
        border: 1px solid rgba(100, 169, 255, .35);
        border-radius: 4px;
        background: linear-gradient(180deg, #1f6fbd, #17578f);
        color: #fff;
        min-height: 32px;
        padding: 0 13px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .02em;
        white-space: nowrap;
        box-shadow: 0 0 0 1px rgba(0,0,0,.18);
        transition: background .12s ease, border-color .12s ease, transform .08s ease;
      }

      .glt-open-btn:hover {
        background: linear-gradient(180deg, #2d85d8, #1d67a7);
        border-color: rgba(130, 190, 255, .55);
      }

      .glt-open-btn:active {
        transform: translateY(1px);
      }

      .glt-open-btn__icon {
        width: 18px;
        height: 18px;
        border-radius: 5px;
        display: grid;
        place-items: center;
        color: #dbeeff;
        background: #0e2740;
        font-size: 12px;
        font-weight: 900;
        line-height: 1;
      }

      #${FALLBACK_ID} {
        position: fixed;
        top: 72px;
        right: 28px;
        z-index: 2147483000;
        filter: drop-shadow(0 8px 18px rgba(0,0,0,.32));
      }

      #${FALLBACK_ID}.glt-hidden {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  function parseAppIdFromLocation() {
    const sources = [
      location.href,
      location.pathname,
      String(history.state?.url || ""),
      String(history.state?.href || "")
    ];

    const patterns = [
      /(?:\/app\/|\/apps\/|\/game\/|\/games\/details\/|\/library\/app\/)(\d{2,})/i,
      /[?&#](?:appid|appId|app_id)=(\d{2,})/i,
      /steam:\/\/nav\/games\/details\/(\d{2,})/i
    ];

    for (const src of sources) {
      for (const re of patterns) {
        const m = src.match(re);
        if (m) return m[1];
      }
    }

    return null;
  }

  function parseAppIdFromDom() {
    const selectors = [
      "[data-appid]",
      "[data-app-id]",
      "[data-app_id]",
      "[data-gameid]",
      "[data-game-id]"
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);

      for (const node of nodes) {
        const value =
          node.getAttribute("data-appid") ||
          node.getAttribute("data-app-id") ||
          node.getAttribute("data-app_id") ||
          node.getAttribute("data-gameid") ||
          node.getAttribute("data-game-id");

        if (/^\d{2,}$/.test(value || "")) {
          const rect = node.getBoundingClientRect?.();
          if (!rect || rect.width > 0 || rect.height > 0)
            return value;
        }
      }
    }

    return null;
  }

  function getCurrentAppId() {
    return parseAppIdFromLocation() || parseAppIdFromDom();
  }

  function launchGLuaTools(appId) {
    if (!appId) return;

    const uri = `gluatools://game/${encodeURIComponent(appId)}`;
    log("Launching", uri);

    // Using an anchor click is generally the most reliable way for Chromium
    // shells to hand a custom protocol to Windows.
    const a = document.createElement("a");
    a.href = uri;
    a.style.display = "none";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();

    setTimeout(() => a.remove(), 1000);
  }

  function makeButton(appId, fallback = false) {
    const btn = document.createElement("button");
    btn.id = fallback ? FALLBACK_ID : BUTTON_ID;
    btn.className = "glt-open-btn";
    btn.type = "button";
    btn.title = `Open AppID ${appId} with GLuaTools`;
    btn.dataset.gluatoolsAppid = appId;

    const icon = document.createElement("span");
    icon.className = "glt-open-btn__icon";
    icon.textContent = "G";

    const label = document.createElement("span");
    label.textContent = "OPEN WITH GLUATOOLS";

    btn.append(icon, label);
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      launchGLuaTools(appId);
    });

    return btn;
  }

  function isButtonish(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    const role = el.getAttribute?.("role");

    return (
      tag === "button" ||
      tag === "a" ||
      role === "button" ||
      el.tabIndex >= 0
    );
  }

  function findPlayButton() {
    // First, try button-like elements with familiar English action labels.
    // Steam is localized, so this is only the preferred path.
    const buttonish = Array.from(
      document.querySelectorAll('button, a, [role="button"], [tabindex="0"]')
    );

    const labels = [
      "PLAY",
      "INSTALL",
      "STREAM",
      "BORROW",
      "UPDATE",
      "RESUME",
      "LAUNCH"
    ];

    for (const el of buttonish) {
      if (!isButtonish(el)) continue;

      const text = (el.innerText || el.textContent || "")
        .trim()
        .replace(/\s+/g, " ")
        .toUpperCase();

      if (!labels.some(label => text === label || text.startsWith(label + " ")))
        continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20) continue;

      // Prefer controls in the upper half of the details page.
      if (rect.top > window.innerHeight * 0.7) continue;

      return el;
    }

    return null;
  }

  function findActionContainer() {
    const play = findPlayButton();
    if (!play) return null;

    let p = play.parentElement;

    for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
      const rect = p.getBoundingClientRect();
      const children = p.children?.length || 0;

      if (
        rect.width >= 120 &&
        rect.height >= 28 &&
        rect.height <= 110 &&
        children >= 1 &&
        children <= 12
      ) {
        return p;
      }
    }

    return play.parentElement;
  }

  function removeExistingButtons() {
    document.getElementById(BUTTON_ID)?.remove();
    document.getElementById(FALLBACK_ID)?.remove();
  }

  function injectForApp(appId) {
    if (!appId) {
      removeExistingButtons();
      lastAppId = null;
      return;
    }

    const existing = document.getElementById(BUTTON_ID);
    const fallback = document.getElementById(FALLBACK_ID);

    if (
      lastAppId === appId &&
      ((existing && existing.dataset.gluatoolsAppid === appId) ||
       (fallback && fallback.dataset.gluatoolsAppid === appId))
    ) {
      return;
    }

    removeExistingButtons();
    lastAppId = appId;

    const container = findActionContainer();

    if (container) {
      const btn = makeButton(appId, false);

      // Put the GLuaTools action after the normal primary action group.
      container.appendChild(btn);
      log("Injected button next to Steam game actions for", appId);
      return;
    }

    // Fallback means the integration remains usable even if Valve changes
    // class names/layout structure in a Steam update.
    const fallbackBtn = makeButton(appId, true);
    document.body.appendChild(fallbackBtn);
    log("Steam action container not found; using fallback button for", appId);
  }

  function refresh() {
    addStyles();

    const appId = getCurrentAppId();
    injectForApp(appId);
  }

  function scheduleRefresh(delay = 80) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay);
  }

  function hookHistory() {
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];

      if (original.__gluatoolsWrapped) continue;

      const wrapped = function (...args) {
        const result = original.apply(this, args);
        scheduleRefresh(60);
        return result;
      };

      wrapped.__gluatoolsWrapped = true;
      history[method] = wrapped;
    }

    window.addEventListener("popstate", () => scheduleRefresh(60));
    window.addEventListener("hashchange", () => scheduleRefresh(60));
  }

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver(() => {
      // Don't run on every mutation synchronously—Steam's React UI can
      // mutate the DOM many times per frame.
      scheduleRefresh(120);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-appid", "data-app-id", "class"]
    });
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 50);
      return;
    }

    addStyles();
    hookHistory();
    startObserver();
    refresh();

    // Backup poll for SPA route changes that do not touch history in the
    // expected way.
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        scheduleRefresh(40);
      }

      const id = getCurrentAppId();
      if (id !== lastAppId)
        scheduleRefresh(40);
    }, 1000);

    log(`${PLUGIN_ID} loaded`);
  }

  init();
})();
