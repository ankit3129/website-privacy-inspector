import { DEFAULTS, normalizeRuleDomain, registrableDomain, withLock } from "./shared.js";

let trackerBlocklist = DEFAULTS.trackerBlocklist.slice();
let trackerSet = buildTrackerSet(trackerBlocklist);
const requestCache = new Map();
const requestLoads = new Map();
const navStarts = new Map();      // tabId -> time the latest top-level request began
const dirtyTabs = new Set();      // tabs whose request log needs flushing to session storage
let flushTimer = null;

function storageGet(defaults) {
  return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
}
function storageSet(values) {
  return new Promise((resolve, reject) => chrome.storage.local.set(values, () => {
    const err = chrome.runtime.lastError;
    if (err) reject(new Error(err.message)); else resolve();
  }));
}
// O(labels) lookup instead of scanning the whole blocklist on every request.
function buildTrackerSet(list) {
  const set = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const d = String(item || "").toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
    if (d) set.add(d);
  }
  return set;
}
function isKnownTracker(host) {
  let h = String(host || "").toLowerCase();
  while (h) {
    if (trackerSet.has(h)) return true;
    const dot = h.indexOf(".");
    if (dot < 0) return false;
    h = h.slice(dot + 1);
  }
  return false;
}
function setTrackerList(list) {
  trackerBlocklist = Array.isArray(list) ? list : DEFAULTS.trackerBlocklist.slice();
  trackerSet = buildTrackerSet(trackerBlocklist);
}
function getSetting(type, primaryUrl) {
  return new Promise((resolve, reject) => {
    const api = chrome.contentSettings[type];
    if (!api) return reject(new Error(`Unsupported Chrome content setting: ${type}`));
    api.get({ primaryUrl }, result => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve(result?.setting || (type === "popups" ? "block" : type === "javascript" ? "allow" : "ask"));
    });
  });
}
function setGlobalSetting(type, setting) {
  return new Promise((resolve, reject) => {
    const api = chrome.contentSettings[type];
    if (!api) return reject(new Error(`Unsupported Chrome content setting: ${type}`));
    api.set({ primaryPattern: "<all_urls>", setting, scope: "regular" }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve();
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  const legacy = await chrome.storage.local.get(null);
  const staleRequestKeys = Object.keys(legacy).filter(key => key.startsWith("requests_"));
  if (staleRequestKeys.length) await chrome.storage.local.remove(staleRequestKeys);
  const existing = await storageGet(Object.keys(DEFAULTS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (existing[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) await storageSet(missing);
  await refreshCachedLists();
  trackerCacheReady = Promise.resolve();
  await applyGlobalRules();
  await refreshTrackerRules();
});

function logChange(action, detail) {
  return withLock("wpi-changelog", () => logChangeUnlocked(action, detail));
}
async function logChangeUnlocked(action, detail) {
  const data = await storageGet({ changeLog: [], retentionDays: 30 });
  const cutoff = Number(data.retentionDays) > 0 ? Date.now() - Number(data.retentionDays) * 86400000 : 0;
  const list = (data.changeLog || []).filter(x => !cutoff || x.time >= cutoff);
  list.unshift({ id: crypto.randomUUID(), time: Date.now(), action, detail });
  await storageSet({ changeLog: list.slice(0, 300) });
}

let globalRulesChain = Promise.resolve();
function applyGlobalRules() {
  globalRulesChain = globalRulesChain.catch(() => {}).then(applyGlobalRulesImpl);
  return globalRulesChain;
}
async function applyGlobalRulesImpl() {
  const data = await storageGet({
    globalRules: DEFAULTS.globalRules,
    globalRulePreviousSettings: {}
  });
  const rules = data.globalRules || DEFAULTS.globalRules;
  const previous = { ...(data.globalRulePreviousSettings || {}) };
  const warnings = [];
  const mapping = [
    ["notifications", "blockNotifications"],
    ["popups", "blockPopups"]
  ];
  for (const [type, key] of mapping) {
    try {
      if (rules[key]) {
        if (!(type in previous)) {
          // Save the effective pre-extension setting once, then restore it when toggled off.
          // The sentinel host is intentionally unlikely to have a site-specific exception.
          previous[type] = await getSetting(type, "https://privacy-inspector.invalid/");
          await storageSet({ globalRulePreviousSettings: previous });
        }
        await setGlobalSetting(type, "block");
      } else if (type in previous) {
        await setGlobalSetting(type, previous[type]);
        delete previous[type];
        await storageSet({ globalRulePreviousSettings: previous });
      }
    } catch (error) {
      console.warn(`Could not apply ${type} global rule:`, error.message);
      warnings.push(`${type}: ${error.message}`);
    }
  }
  // Third-party-only cookie blocking is intentionally not simulated: Chrome's
  // contentSettings cookie API cannot express that rule accurately.
  return warnings;
}

// Serialised: overlapping updateDynamicRules calls reuse the same rule IDs and would fail
// with "does not have a unique ID" if the second call removed a stale snapshot of the rules.
let trackerRulesChain = Promise.resolve();
function refreshTrackerRules() {
  trackerRulesChain = trackerRulesChain.catch(() => {}).then(refreshTrackerRulesImpl);
  return trackerRulesChain;
}
async function refreshTrackerRulesImpl() {
  const data = await storageGet({ globalRules: DEFAULTS.globalRules, trackerBlocklist: DEFAULTS.trackerBlocklist, trackerAllowlist: [] });
  const enabled = !!data.globalRules?.blockTrackers;
  const blocked = [...new Set((data.trackerBlocklist || []).map(normalizeRuleDomain).filter(Boolean))];
  const allowed = [...new Set((data.trackerAllowlist || []).map(normalizeRuleDomain).filter(Boolean))];
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const addRules = [];
  const resourceTypes = ["script", "image", "stylesheet", "font", "xmlhttprequest", "ping", "sub_frame", "media", "websocket", "other"];
  const chunk = (items, size = 100) => { const out = []; for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size)); return out; };
  if (enabled) {
    chunk(blocked).forEach((domains, index) => addRules.push({ id: 1 + index, priority: 1, action: { type: "block" }, condition: { requestDomains: domains, domainType: "thirdParty", resourceTypes } }));
    chunk(allowed).forEach((domains, index) => addRules.push({ id: 1001 + index, priority: 2, action: { type: "allow" }, condition: { requestDomains: domains, resourceTypes } }));
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(rule => rule.id), addRules });
}

async function refreshCachedLists() {
  const data = await storageGet({ trackerBlocklist: DEFAULTS.trackerBlocklist });
  setTrackerList(data.trackerBlocklist);
}
let trackerCacheReady = refreshCachedLists().catch(() => {});
chrome.runtime.onStartup.addListener(() => { trackerCacheReady = refreshCachedLists().catch(() => {}); });

async function loadRequests(tabId) {
  if (requestCache.has(tabId)) return requestCache.get(tabId);
  if (requestLoads.has(tabId)) return requestLoads.get(tabId);
  const key = `requests_${tabId}`;
  const load = new Promise(resolve => chrome.storage.session.get({ [key]: [] }, resolve)).then(data => {
    const records = Array.isArray(data[key]) ? data[key] : [];
    if (requestLoads.get(tabId) === load) requestCache.set(tabId, records);
    if (requestLoads.get(tabId) === load) requestLoads.delete(tabId);
    return requestCache.get(tabId) || records;
  }).catch(error => {
    if (requestLoads.get(tabId) === load) requestLoads.delete(tabId);
    throw error;
  });
  requestLoads.set(tabId, load);
  return load;
}
// Request logs live in memory (requestCache) and are mirrored to session storage in
// batches, so a page that contacts 40 hosts costs one write instead of 40. Resets
// (navigation, clear) flush immediately so a worker restart can never resurrect old data.
function persistRequests(tabId, immediate = false) {
  dirtyTabs.add(tabId);
  if (immediate) { clearTimeout(flushTimer); flushTimer = null; return flushRequests(); }
  if (!flushTimer) flushTimer = setTimeout(flushRequests, 250);
  return Promise.resolve();
}
function flushRequests() {
  flushTimer = null;
  const values = {};
  for (const tabId of dirtyTabs) {
    const records = requestCache.get(tabId);
    if (records) values[`requests_${tabId}`] = records.slice(-150);
  }
  dirtyTabs.clear();
  if (!Object.keys(values).length) return Promise.resolve();
  return new Promise(resolve => chrome.storage.session.set(values, () => { void chrome.runtime.lastError; resolve(); }));
}

// Cache the lists and per-tab request arrays to avoid a storage read for every network event.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.trackerBlocklist) {
    setTrackerList(changes.trackerBlocklist.newValue);
  }
});


// Capture top-level response headers directly from Chrome's network events.
// Header capture only covers top-level responses observed after the extension
// was installed/reloaded; unavailable records remain explicitly unverified.
const SECURITY_HEADER_CACHE_KEY = "securityHeaderCache";
let securityHeaderWrite = Promise.resolve();
function saveSecurityHeader(record) {
  securityHeaderWrite = securityHeaderWrite.catch(() => {}).then(async () => {
    const data = await chrome.storage.session.get({ [SECURITY_HEADER_CACHE_KEY]: [] });
    const records = Array.isArray(data[SECURITY_HEADER_CACHE_KEY]) ? data[SECURITY_HEADER_CACHE_KEY].filter(x => x.url !== record.url) : [];
    records.push(record);
    await chrome.storage.session.set({ [SECURITY_HEADER_CACHE_KEY]: records.slice(-100) });
  });
  return securityHeaderWrite;
}
const SECURITY_HEADER_NAMES = new Set([
  "content-security-policy", "strict-transport-security", "x-content-type-options",
  "x-frame-options", "referrer-policy", "permissions-policy"
]);
function normalizedPageUrl(value) {
  try { const u = new URL(value); u.hash = ""; return u.href; } catch { return ""; }
}
chrome.webRequest.onHeadersReceived.addListener(details => {
  if (details.type !== "main_frame" || details.tabId < 0) return;
  if (details.statusCode >= 300 && details.statusCode < 400) return;
  const url = normalizedPageUrl(details.url);
  if (!url) return;
  const headers = {};
  for (const header of (details.responseHeaders || [])) {
    const name = String(header.name || "").toLowerCase();
    if (SECURITY_HEADER_NAMES.has(name) && header.value != null) {
      headers[name] = headers[name] ? `${headers[name]}, ${header.value}` : String(header.value);
    }
  }
  saveSecurityHeader({ url, headers, capturedAt: Date.now(), statusCode: details.statusCode }).catch(error => console.warn("Could not cache response headers:", error.message));
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["responseHeaders"]);

chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.tabId < 0) return;
  if (details.type === "main_frame") {
    requestCache.set(details.tabId, []);
    requestLoads.delete(details.tabId);
    navStarts.set(details.tabId, Date.now());
    persistRequests(details.tabId, true);
    return; // The destination page is not a third-party subresource.
  }
  let sourceHost = "", targetHost = "";
  try { sourceHost = new URL(details.documentUrl || details.initiator || "").hostname.toLowerCase(); } catch {}
  try { targetHost = new URL(details.url || "").hostname.toLowerCase(); } catch {}
  if (!sourceHost || !targetHost || registrableDomain(sourceHost) === registrableDomain(targetHost)) return;
  trackerCacheReady.then(() => {
    return loadRequests(details.tabId).then(records => {
      // Dedupe first: repeat hits to a host/type pair skip the tracker lookup entirely.
      if (records.some(item => item.host === targetHost && item.type === details.type)) return;
      records.push({ host: targetHost, source: sourceHost, type: details.type, known: isKnownTracker(targetHost), time: Date.now() });
      if (records.length > 150) records.splice(0, records.length - 150);
      persistRequests(details.tabId);
    });
  }).catch(error => console.warn("Could not record request metadata:", error.message));
}, { urls: ["<all_urls>"] });

chrome.tabs.onRemoved.addListener(tabId => {
  requestCache.delete(tabId);
  requestLoads.delete(tabId);
  navStarts.delete(tabId);
  dirtyTabs.delete(tabId);
  chrome.storage.session.remove(`requests_${tabId}`);
});

// A committed top-level navigation normally follows a main_frame request that already reset
// the log, so keep anything logged since that request began. If no request preceded the commit
// (bfcache restore, prerender activation) nothing is carried over from the previous page.
chrome.webNavigation.onCommitted.addListener(async details => {
  if (details.frameId !== 0 || details.tabId < 0) return;
  const since = navStarts.get(details.tabId) ?? details.timeStamp;
  navStarts.delete(details.tabId);
  try {
    const records = await loadRequests(details.tabId);
    const kept = records.filter(item => item.time >= since);
    if (kept.length !== records.length) {
      records.splice(0, records.length, ...kept);
      await persistRequests(details.tabId, true);
    }
  } catch (error) {
    console.warn("Could not reset request metadata:", error.message);
  }
}, { url: [{ schemes: ["http", "https"] }] });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "getSecurityHeaders") {
        const url = normalizedPageUrl(msg.url);
        const data = await chrome.storage.session.get({ [SECURITY_HEADER_CACHE_KEY]: [] });
        const record = url ? (data[SECURITY_HEADER_CACHE_KEY] || []).find(x => x.url === url) : null;
        sendResponse({ ok: true, record: record || null });
      } else if (msg.type === "getRequests") {
        const tabId = Number(msg.tabId);
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Invalid tab id.");
        const records = await loadRequests(tabId);
        sendResponse({ ok: true, records });
      } else if (msg.type === "clearRequests") {
        const tabId = Number(msg.tabId);
        if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Invalid tab id.");
        requestCache.set(tabId, []);
        await persistRequests(tabId, true);
        sendResponse({ ok: true });
      } else if (msg.type === "cleanupCurrentSite") {
        if (!msg.url || !/^https?:/i.test(msg.url)) throw new Error("Open a regular website first.");
        const origin = new URL(msg.url).origin;
        await new Promise((resolve, reject) => chrome.browsingData.remove(
          { origins: [origin] },
          { cookies: true, localStorage: true, indexedDB: true, serviceWorkers: true,
            cacheStorage: true, fileSystems: true },
          () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
        ));
        await logChange("Site data cleared", origin);
        sendResponse({ ok: true });
      } else if (msg.type === "applyGlobalRules") {
        const warnings = await applyGlobalRules();
        sendResponse({ ok: true, warnings });
      } else if (msg.type === "refreshTrackerRules") {
        await refreshTrackerRules();
        sendResponse({ ok: true });
      } else if (msg.type === "logChange") {
        await logChange(msg.action, msg.detail);
        sendResponse({ ok: true });
      } else sendResponse({ ok: false, error: "Unknown message" });
    } catch (error) {
      sendResponse({ ok: false, error: String(error.message || error) });
    }
  })();
  return true;
});

// Re-assert block settings whenever the worker starts. onInstalled does not fire when an
// extension is re-enabled, and Chrome can drop extension-set content settings while disabled.
// A session flag keeps this to once per browser session instead of on every worker wake-up
// (the worker wakes for each network request after idling). Session storage is cleared when the
// extension is disabled, reloaded or the browser restarts, which is exactly when it must re-run.
async function reassertGlobalRulesOncePerSession() {
  const FLAG = "globalRulesAsserted";
  let done = false;
  try { done = !!(await chrome.storage.session.get({ [FLAG]: false }))[FLAG]; } catch {}
  if (done) return;
  const warnings = await applyGlobalRules();
  if (!warnings.length) { try { await chrome.storage.session.set({ [FLAG]: true }); } catch {} }
}
reassertGlobalRulesOncePerSession().catch(error => console.warn("Could not re-apply global rules:", error.message));
