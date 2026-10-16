export const DEFAULT_TRACKERS = [
  "google-analytics.com", "googletagmanager.com", "doubleclick.net", "connect.facebook.net", "facebook.com", "hotjar.com", "clarity.ms", "segment.io", "segment.com", "amplitude.com", "mixpanel.com", "fullstory.com", "quantserve.com", "scorecardresearch.com", "adnxs.com", "adsrvr.org", "criteo.com", "taboola.com", "outbrain.com", "analytics.tiktok.com", "pixel.tiktok.com"
];
export const DEFAULTS = {
  trustedSites: [], siteProfiles: {},
  globalRules: { blockNotifications: false, blockPopups: false, blockThirdPartyCookies: false, blockTrackers: false },
  globalRulePreviousSettings: {}, trackerBlocklist: DEFAULT_TRACKERS, trackerAllowlist: [],
  privacyHistory: [], changeLog: [], retentionDays: 30
};
export function isValidDomain(value) {
  if (!value || value.length > 253 || value.includes("/") || value.includes(":")) return false;
  return value.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
// True for entries that would match a whole TLD or public suffix ("com", "co.uk", "github.io").
// Used for tracker rules and profiles, where such an entry would affect unrelated sites.
export function isTooBroad(domain) {
  const d = String(domain || "").toLowerCase();
  if (!d || IPV4.test(d) || d === "localhost") return false;
  return !d.includes(".") || MULTI_PART_SUFFIXES.has(d);
}
export function normalizeDomain(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/^\*\./, "").replace(/^\./, "");
  return isValidDomain(raw) ? raw : "";
}
// normalizeDomain plus a rejection of TLD/public-suffix-wide entries.
export function normalizeRuleDomain(value) {
  const d = normalizeDomain(value);
  return d && !isTooBroad(d) ? d : "";
}

// Heuristic registrable-domain (eTLD+1) lookup. Not a full Public Suffix List: it covers the
// common multi-part country suffixes and popular hosting platforms where subdomains belong
// to different parties (user1.github.io vs user2.github.io).
const MULTI_PART_SUFFIXES = new Set([
  "co.uk","org.uk","ac.uk","gov.uk","me.uk","ltd.uk","plc.uk","net.uk","sch.uk",
  "com.au","net.au","org.au","edu.au","gov.au","co.nz","org.nz","net.nz","govt.nz",
  "co.jp","ne.jp","or.jp","ac.jp","go.jp","co.kr","or.kr","go.kr","co.in","net.in","org.in","ac.in","gov.in","firm.in",
  "com.br","net.br","org.br","gov.br","com.cn","net.cn","org.cn","gov.cn","com.hk","org.hk","com.sg","com.tw","org.tw",
  "com.mx","com.ar","com.co","com.pe","com.ve","com.tr","com.sa","com.eg","com.ng","co.za","org.za","co.ke","co.il",
  "co.id","com.my","com.ph","com.vn","com.pk","com.bd","com.ua","com.pl","com.ru","com.es","com.pt","com.gr",
  "github.io","gitlab.io","herokuapp.com","blogspot.com","pages.dev","workers.dev","vercel.app","netlify.app",
  "web.app","firebaseapp.com","appspot.com","azurewebsites.net","cloudfront.net","s3.amazonaws.com","fly.dev","onrender.com"
]);
export function registrableDomain(host) {
  const h = String(host || "").toLowerCase().replace(/\.$/, "");
  if (!h || h.includes(":") || IPV4.test(h)) return h;
  // S3 buckets (bucket.s3.amazonaws.com, bucket.s3.us-east-1.amazonaws.com) belong to different parties.
  const s3 = h.match(/(?:^|\.)([^.]+\.s3(?:[.-][a-z0-9-]+)*\.amazonaws\.com)$/);
  if (s3) return s3[1];
  const parts = h.split(".");
  if (parts.length <= 2) return h;
  if (parts.length >= 4 && MULTI_PART_SUFFIXES.has(parts.slice(-3).join("."))) return parts.slice(-4).join(".");
  return MULTI_PART_SUFFIXES.has(parts.slice(-2).join(".")) ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
}
// Serialises read-modify-write sections across the service worker and dashboard pages.
export function withLock(name, fn) {
  const locks = globalThis.navigator?.locks;
  return locks?.request ? locks.request(name, fn) : Promise.resolve().then(fn);
}
