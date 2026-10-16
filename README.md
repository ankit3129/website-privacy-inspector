# Website Privacy Inspector

A free, local-first Chrome extension for inspecting website privacy signals, managing cookies and site permissions, observing third-party request hosts, and applying optional tracker-blocking rules.

**Current version:** 2.6.3  
**License:** MIT  
**Minimum Chrome version:** 121

## Highlights

- Cookie metadata inspection and deletion tools.
- Chrome content-setting controls and reusable site profiles.
- Optional tracker blocking using Manifest V3 declarative network rules.
- Local request metadata, snapshots, audit history, and JSON backup/restore.
- Best-effort security-header checks using locally captured responses.
- No paid APIs, backend, analytics service, or hosting requirement.

## Install from source

1. Download or clone this repository.
2. Extract the zip file if you have downloaded.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the repository folder containing `manifest.json`.
6. Open a regular HTTPS website, reload it, then open the extension.

## Permissions and privacy

The extension requests broad `<all_urls>` host access to inspect cross-site request metadata and manage cookies across websites. Chrome may display a broad-access warning. It stores settings and history in Chrome storage and does not use an external reputation API. Security analysis uses response headers captured as you browse; normal website navigation still contacts those websites.

Review the full permissions and limitations in the source and in the extension dashboard before enabling optional blocking or cleanup features.

## Limitations

- Tracker blocking is optional, uses a finite list, and can break websites.
- Trusted-site entries are labels; they do not automatically bypass tracker blocking.
- The third-party-cookie toggle is informational, not a third-party-only Chrome policy.
- Security checks are best-effort and are not a malware scanner or a guarantee that a website is safe.
- Cookie deletion and cleanup may sign you out or remove site data.
- Static checks do not replace testing in Chrome.

## Development checks

Use Node.js to syntax-check the JavaScript modules:

```sh
node --check background.js
node --check shared.js
node --check popup.js
node --check dashboard.js
```

These checks verify syntax only. Test Chrome permissions, content-setting patterns, tracker rules, cookie operations, backup/restore, and navigation behavior in a real browser.

## License

Released under the [MIT License](LICENSE).
