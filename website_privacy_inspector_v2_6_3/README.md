# Website Privacy Inspector v2.6.2

**Budget: ₹0.** No account, paid API, subscription, backend, analytics, or hosting. Extension settings and history are stored locally in Chrome. Security Analysis does not send data to a third-party reputation service and does not make a separate request. It uses locally captured Chrome response headers from pages you have loaded. Because the browser naturally contacts sites you visit, this is not a network-isolated tool.

## Install or update
1. Download and extract `website_privacy_inspector_v2_6_2.zip`.
2. Open `chrome://extensions` in Chrome and enable **Developer mode**.
3. If v2.0 is installed, export its JSON backup before replacing it. For an unpacked extension, you can replace the source files in its existing folder and click **Reload**, or load this extracted folder as a separate extension. A separately loaded extension has separate storage.
4. Click **Load unpacked** and select the extracted `website_privacy_inspector_v2_6_2` folder containing `manifest.json`.
5. Open a regular website, refresh it, click the extension icon, and open the full dashboard.

## Earlier v2.1 improvements (historical)
- Fixed the Location permission mapping to Chrome's `location` content setting.
- Permission selectors now offer only values supported by each setting; invalid Ask values are not offered for pop-ups, JavaScript, or cookies.
- Global notification/pop-up blocks remember the effective prior setting and restore it when the toggle is disabled.
- Removed duplicate site-cleanup message handling so one cleanup action does not run twice when the dashboard is open.
- Cookie deletion now includes partition keys where Chrome exposes them, avoiding ambiguity for partitioned cookies.
- Tracker allowlist rules now explicitly override matching block rules, including subdomains; blocklist changes are applied when entries are removed too.
- Request observation caches per-tab data and the tracker list, reducing repeated storage reads and avoiding the previous read-modify-write race for simultaneous requests.
- Cookie tables cap rendered rows at 300 per view to keep the dashboard responsive; search/filter still work over the full local list.
- Backup restore validates domains, settings, and list sizes before saving imported data.
- Security header requests time out after eight seconds and are skipped for URLs containing embedded credentials.
- Retention is applied when logging and when the dashboard opens.

**Upgrade note from v2.0:** the older version did not save the pre-block notification/pop-up setting. If v2.0 had already applied a global block, v2.1 cannot infer the original setting with certainty. After updating, check Chrome site settings if those controls were previously used; v2.1 saves/restores the effective prior setting going forward.

## v2.1.1 review fix
- When global notification/pop-up blocking is enabled, the global settings dropdown now shows the saved pre-block setting instead of the effective forced `block` state, preventing an ordinary save from accidentally changing the value that will be restored when blocking is turned off. For legacy v2.0 installs without a saved prior value, the UI uses conservative fallback values; verify Chrome settings after migration.

## Features
- Popup overview, cookie metadata, observed third-party request hosts, and Chrome content settings.
- Cookie search/filter, individual deletion, bulk deletion, and current-site cookie cleanup.
- Per-site content-setting controls and global settings for supported categories.
- Trusted-domain labels and reusable profiles.
- Global notification/pop-up controls and local tracker blocklist/allowlist.
- Tracker blocking through Manifest V3 `declarativeNetRequest` dynamic rules.
- Local inspection snapshots and action history.
- JSON backup/restore and local history retention.
- Origin-scoped cleanup for supported website data.
- Lightweight HTTPS/URL/header checks.

## Permissions
- `cookies`: inspect cookie metadata and remove selected cookies.
- `storage`: local settings, profiles, observed request metadata, and history.
- `contentSettings`: inspect/change supported Chrome site settings.
- `webRequest`: observe third-party request metadata; no request blocking is done through this API.
- `declarativeNetRequest`: block configured tracker domains.
- `browsingData`: remove supported data for a selected origin.
- `webNavigation`: detect committed top-level navigations (including history/back-forward restores) so the per-tab request log never shows another page's hosts. Only the navigation event is used; no URLs are stored from it.
- Tab URLs are readable under the broad `<all_urls>` host permission, so the `tabs` permission is not requested. The popup finds an already-open dashboard through `runtime.getContexts`.
- `<all_urls>` host permission: required for cross-site request observation and cookie management across sites. Chrome will show a broad access warning.

If you do not want to grant broad website access, do not install this build. A reduced-permission version could remove request observation and/or cross-site cookie management, but those features would then be limited.

## Limitations and safety notes
- Cookie values are never displayed. Cookie deletion cannot be undone and may log you out.
- Tracker blocking is off by default. The bundled list is small and incomplete; blocking may break websites.
- The trusted list is an organizational label; it does not automatically bypass blocking.
- The third-party-cookie global toggle is informational only. Chrome's `contentSettings.cookies` API cannot accurately express a third-party-only policy, so this extension does not pretend to implement it.
- Global notification/pop-up toggles store the effective setting seen for a neutral URL before applying a block. Turning the toggle off restores that saved setting. If you separately change the same Chrome setting while the toggle is enabled, use the dashboard's global settings carefully because the saved prior value may be restored later.
- Global settings and site-specific exceptions can interact according to Chrome's pattern precedence.
- Cleanup is limited to the selected origin and supported data types; it does not clear related subdomains, server-side records, other Chrome profiles, or every possible site storage mechanism.
- The third-party request log is session-only (cleared when the browser restarts) and only covers pages loaded after the extension was installed or reloaded. Pages restored from back/forward history or prerendered are not re-requested, so their list is empty until you reload.
- Header checks look at values, not just presence: an HSTS header with `max-age=0` or an `X-Content-Type-Options` value other than `nosniff` is reported as ineffective, and a missing `X-Frame-Options` is accepted when the CSP has `frame-ancestors`.
- Profiles saved by v2.4 or earlier may contain explicit values from the old form defaults (for example Pop-ups = allow). Review them in the profile list before applying; blank (—) means no change.
- Security header checks are best-effort. Redirects, pages not loaded since extension start/reload, and browser lifecycle timing may make data unavailable. Missing/unavailable data is not proof of a vulnerability.
- This is not a malware scanner or a guarantee of privacy. Browser-internal and protected pages cannot be inspected.

## Test checklist
1. Load unpacked and verify no errors on `chrome://extensions`.
2. Open `https://example.com`, refresh, and inspect the popup.
3. Open Cookie manager; search/filter and test deletion only on a disposable site where logging out is acceptable.
4. Inspect a site's permission settings; try one change on a disposable site and verify Chrome reflects it.
5. Enable and disable global notification/pop-up blocking; confirm the prior setting is restored.
6. Add a tracker domain, enable blocking, test a safe site, then remove the domain and verify the rule list updates.
7. Add an allowlist domain that also appears on the blocklist and confirm the allow rule takes precedence.
8. Save a profile, apply it to a disposable domain, and review the result.
9. Save a snapshot, export JSON, and restore it.
10. Test cleanup on a disposable origin and security analysis on an HTTPS page.
11. Open a busy site, open the popup, and confirm External hosts and tracker matches are non-zero; press Back/Forward and confirm the list is not another page's.
12. Apply a profile to a disposable domain and check `chrome://settings/content` shows it (the wildcard pattern falls back to exact host if Chrome rejects it; the toast/log says so).
13. With the dashboard already open, click "Open full dashboard" in the popup and confirm it focuses the existing tab instead of opening a second one.
14. Check the install prompt/`chrome://extensions` details after loading to confirm the permission list matches the Permissions section.


## v2.2.0 security analysis improvements

- Captures top-level HTTP(S) response headers through `chrome.webRequest.onHeadersReceived` when Chrome exposes them. No new permissions were added; existing `webRequest` and `<all_urls>` access are used.
- Header results distinguish **Present**, **Missing** (only when a top-level response was actually captured), and **Could not verify**. Uncaptured checks are not counted as missing headers.
- Adds a transparent risk summary that separates confirmed concerns from incomplete checks. It is a lightweight signal report, not a malware scan or reputation verdict.
- Mixed-content detection remains explicitly unverified; this extension does not claim a complete mixed-content audit.
- Header cache uses `chrome.storage.session`, is bounded to 100 pages, is cleared when the browser session ends, and is not sent to a server.

### Security analysis testing
1. Reload the extension at `chrome://extensions`.
2. Open an HTTPS site in a normal tab and wait for it to load.
3. Open the extension dashboard, run Security Analysis for that exact URL, and verify headers are marked Present/Missing only when a captured top-level response exists.
4. Analyze a URL that has not been loaded in a tab; unavailable headers should say Could not verify, not Missing.
5. Compare results with the browser DevTools Network panel. Browser APIs and redirects can still limit visibility.


## v2.3.0 corrective review (historical)
- Dashboard active-site selection now chooses the most recently accessed HTTP/HTTPS tab rather than the dashboard itself.
- Corrected the Location setting to use Chrome's `contentSettings.location` API.
- Added `globalRulePreviousSettings` to dashboard defaults and only applies global permission values that were actually changed. Destructive global JavaScript/cookie blocking requires confirmation.
- Tracker rules are compact, match configured request domains and subdomains, and block only third-party requests. Allow rules have higher priority. The list is not silently truncated; rules are chunked for larger lists, subject to Chrome's dynamic-rule quotas.
- Per-tab request history and captured response headers use `chrome.storage.session`, are cleared on browser restart, and request logs reset on main-frame navigation. Popup clearing goes through the service worker.
- Security analysis no longer makes a HEAD request. A header is reported missing only when a non-redirect top-level response was actually captured; otherwise it is reported as unverified.
- Removed deprecated `webSQL` and `appcache` browsing-data flags, sanitized restored history fields, improved domain normalization, fixed Back/Forward hash navigation, reused an existing dashboard tab, and synchronized version labels from the manifest.
- Minimum Chrome version is 121. The redundant `activeTab` and `tabs` permissions were removed; broad host access supplies URL visibility, while tab API methods remain available.

**v2.4.0 review fixes:** request navigation itself is no longer logged as a third-party host; old `requests_*` keys are removed from local storage on upgrade; backup restore preserves live global-rule restoration state and refuses oversized tracker lists rather than truncating them; profile patterns use `*://*.domain/*`; risk scoring is less noisy; cookie-table actions are delegated, cookie lookups are indexed, search is debounced, and bulk deletes run concurrently.

**Testing boundary:** static checks are not equivalent to running in Chrome. Test the active-tab actions, global settings restoration, tracker allow/block precedence, partitioned-cookie deletion, request reset on navigation, backup restore, and security-header states before relying on this release.


## v2.4.0 corrective review
- Fixed main-frame navigation being recorded as an external host.
- Removed legacy local-storage request logs during install/update.
- Backup restore preserves live `globalRulePreviousSettings` so current Chrome rules can be reconciled; tracker lists are rejected if they exceed 10,000 entries rather than silently truncated; larger lists are split into bounded DNR rules. Shared defaults and domain validation are maintained in `shared.js`.
- Risk scoring downweights missing CSP/HSTS and referrer policy; a red status requires a stronger combination of concerns.
- Profile patterns updated to `*://*.domain/*` for the base domain and subdomains; verify against Chrome content settings in runtime tests.
- Guarded hash navigation, focused the dashboard window before activating its tab, and removed the redundant `tabs` permission.
- Added extension icons and made dashboard version display read from the manifest.
- Updated documentation for session-backed header cache and removed outdated cross-origin-fetch language.
- Cookie table actions are delegated, keys/search text are cached, search is debounced, and bulk deletion runs concurrently.


## v2.5.0 corrective review

- Added top-level `webNavigation.onCommitted` resets to cover history navigation where no request event fires.
- Profile selects now support “No change”; profile application skips blank settings. IP and localhost profile patterns use exact-host match patterns.
- Tracker lists are filterable and paginated in 100-item pages. Audit logging reads only the change log and retention setting.
- Quick global toggles write audit entries; popup rejects non-HTTP(S) schemes. Dashboard renders only the current section on initial load.
- Version labels and setup paths updated. Chrome runtime verification is still required for match patterns, dashboard reuse, and event behavior.


## v2.5.1 corrective fixes

- Restored the in-memory tracker blocklist cache and refreshes it on startup and local storage changes, fixing request metadata logging and tracker-match counts.
- Tracker blocklist and allowlist pagination now use independent page counters; the search input immediately filters both lists.
- Backup restore accepts blank profile values as “No change”, and profile summaries display blank settings as an em dash. Older backups that contain explicit values from previous profile defaults remain explicit because the user's original intent cannot be inferred safely.

Static checks pass; live Chrome runtime testing is still required.


## v2.6.2 fixes and optimizations
**Fixes**
- Tracker rule updates are serialised, so overlapping saves can no longer collide on rule IDs ("does not have a unique ID").
- Tracker blocklist/allowlist entries and site profiles reject whole TLDs and public suffixes (`com`, `co.uk`, `github.io`); such entries are also ignored when building rules and when restoring a backup. Trusted-site labels are unaffected.
- `registrableDomain` now handles S3 buckets (`a.s3.amazonaws.com`, `b.s3.us-east-1.amazonaws.com`) and any three-label platform suffix, so different buckets are separate parties.
- Backup restore reports Chrome-setting and tracker-rule failures instead of always saying "Backup restored."
- History retention purge runs under the change-log lock, so it cannot overwrite an entry logged by the service worker at the same time.
- Refresh now reloads the Cookie manager and Permission manager data, not just the overview.
- Unchecked `runtime.lastError` console warnings removed from cookie deletion, snapshot and popup message callbacks.

**Optimizations**
- Global block settings are re-asserted once per browser session (session-storage flag) rather than on every service-worker wake-up.
- Retention purge writes only when something was actually removed.
- Opening the dashboard on a hash page renders that page once instead of twice.

**Not changed:** restoring a pre-block notification/pop-up value still writes it explicitly. `contentSettings.clear()` would remove every rule the extension set for that type, including per-site exceptions from profiles and the permission manager.

The `tests/` folder is no longer part of the package; it ships separately as a development aid.

## v2.6.1 fixes and optimizations

- Third-party detection now compares registrable domains (eTLD+1, heuristic suffix list) instead of raw hostnames, so `www.example.com` loading `static.example.com` is no longer counted as third-party.
- The response-header listener is filtered to `main_frame`, so subresource response headers are no longer dispatched to the service worker.
- Global notification/pop-up block settings are re-asserted whenever the service worker starts (covers disable/enable and browser restarts); rule application is serialised.
- Change-log writes from the service worker and dashboard are serialised with `navigator.locks`.
- Security check: `frame-ancestors` is detected in any of several joined CSP headers.
- Permissions page no longer throws on malformed URLs such as `http://`.

## v2.6.0 fixes and optimizations
**Fixes**
- Header scoring now checks values: HSTS `max-age=0` and a non-`nosniff` `X-Content-Type-Options` are flagged as ineffective; a missing `X-Frame-Options` is shown as covered when the CSP has `frame-ancestors`.
- Request-log reset on navigation keeps hosts already logged since the navigation began and only discards a previous page's records for history/prerender restores (previously every commit wiped the log).
- Chrome setting failures are no longer silent: Save rules, the quick toggles and the Tracker page toggle report what Chrome refused, and a toggle that could not be applied is reverted instead of showing a state that is not in effect.
- "Erase all extension data" aborts (and keeps your data) if the saved notification/pop-up settings could not be restored first, so Chrome cannot be left permanently blocked.
- Adding or removing tracker domains reports rule-apply failures, and the UI enforces the same 10,000-domain cap as restore.
- Profile patterns try `*://*.domain/*` first and fall back to the exact host if Chrome rejects the wildcard form; the fallback is disclosed.
- Pop-up `item()` descriptions are escaped by default (no raw-HTML parameter); the empty request list explains why it can be empty.
- `getSetting` defaults are type-aware (JavaScript defaults to allow, pop-ups to block).
- The popup locates an existing dashboard tab with `runtime.getContexts` (works without the `tabs` permission), falling back to `tabs.query`.

**Optimizations**
- Request logs are batched into one session-storage write per 250 ms instead of one write per newly seen host; resets flush immediately.
- The overview, tracker lists, rule toggles and erase handler read only the storage keys they need (instead of the whole store, including the tracker lists); the overview repaint is debounced and only runs while the overview is visible.
- One toggle helper replaces four near-identical handlers.

**Development smoke tests** (`tests/`, optional; delete the folder before publishing)
- `node tests/run.mjs` runs `background.js`, `dashboard.js` and `popup.js` under stubbed `chrome`/DOM APIs and drives the real handlers (66 checks). They catch undefined variables and wiring mistakes that `node --check` cannot see. They do not replace testing in Chrome.

Static and stubbed tests pass; live Chrome testing is still required for content-setting patterns, DNR rules and event ordering.

