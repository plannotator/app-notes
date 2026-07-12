# App Notes release checklist

This is the go/no-go checklist for a public App Notes release. Michael Ramos owns final product QA; Plannotator distributes the extension.

## Release strategy

- Submit Chrome, Firefox, and Edge in parallel from one approved commit. Edge reuses the Chrome package.
- Treat Arc as a tested Chrome distribution, not a separate store submission. Arc installs Chrome Web Store extensions.
- Treat Safari as a separate release track. WXT produces the Safari web extension, but Apple requires a native app wrapper, signing, and App Store submission. App Notes falls back to an all-notes browser tab where the native side panel API is unavailable.
- Do the first store submissions manually. Store listings must exist before WXT can automate later submissions.
- While approvals are pending, keep the release commit frozen except for release-blocking fixes. Give technical testers unpacked builds; do not present unsigned packages as normal end-user installs.

Official references: [WXT publishing](https://wxt.dev/guide/essentials/publishing.html), [Chrome publishing](https://developer.chrome.com/docs/webstore/publish/), [Firefox submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [Edge publishing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [Safari web extensions](https://developer.apple.com/documentation/safariservices/safari-web-extensions), and [Arc extensions](https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open).

## 1. Accounts and ownership

- [ ] Chrome Web Store developer account exists, registration is paid, and two-step verification is enabled.
- [ ] Mozilla Add-ons developer account exists.
- [ ] Microsoft Partner Center account is enrolled for Edge extensions.
- [ ] Decide the Safari seller name before enrolling: publishing as “Plannotator” requires an eligible legal organization and Apple organization enrollment; otherwise Apple displays the individual account's legal name.
- [ ] Apple Developer Program membership is active if Safari ships in this release.
- [ ] Store recovery methods and credentials are held outside the repository.

## 2. Freeze a release candidate

- [ ] Every intended change is merged to `main`.
- [ ] Working tree is clean and GitHub `main` matches the tested commit.
- [ ] `package.json` has the intended version. Every rejected-and-resubmitted binary gets a higher version.
- [ ] `README.md`, `PRIVACY.md`, `SOURCE_CODE_REVIEW.md`, and this checklist are accurate.
- [ ] The public privacy-policy URL is `https://github.com/plannotator/app-notes/blob/main/PRIVACY.md`.
- [ ] Run `bun install --frozen-lockfile` from a clean checkout.
- [ ] Run `bun run release:verify`.
- [ ] Run the GitHub **Release candidate** workflow for an independently built artifact.

## 3. Michael's final product QA

Use clean browser profiles. Record pass/fail, browser version, operating system, and the release commit in the release issue.

Test on Chrome Stable, Firefox Stable, Edge Stable, and current Arc. Test Safari on a packaged macOS app before including it in the release. Windows coverage is required for Edge; macOS coverage is required for Arc and Safari.

### Core annotation flow

- [ ] App Notes starts disabled and does not intercept normal page clicks.
- [ ] Enabling annotations from the popup and keyboard shortcut works.
- [ ] Hovering shows the correct element outline and readable label.
- [ ] Clicking opens the note composer in a sensible position.
- [ ] Saving by button and `Cmd/Ctrl+Enter` works; blank notes cannot be saved.
- [ ] Clicking away once says the draft is safe in plain language; clicking again discards it.
- [ ] `Esc` follows the same guarded-draft behavior.
- [ ] Existing markers restore after reload, browser restart, and extension restart.
- [ ] Editing and deleting individual notes work.
- [ ] Annotation mode can be disabled without removing saved markers.

### State and navigation

- [ ] Notes survive normal navigation between multiple pages on the same site.
- [ ] Notes survive History API navigation in a single-page app.
- [ ] Reproduce the original Yahoo case: create notes across several routes, navigate again, and confirm every note remains.
- [ ] Open two tabs on one site, create notes quickly in both, and confirm neither write is lost or duplicated.
- [ ] Refresh or close immediately after saving, reopen, and confirm the note exists.
- [ ] Notes for different origins remain isolated.
- [ ] Corrupt or stale saved records do not break the extension UI.

### Site and global note management

- [ ] The native side panel opens in Chrome, Edge, Firefox, and Arc.
- [ ] The full-tab notes workspace opens on Safari or any browser without the side-panel API.
- [ ] Current-site notes include every annotated page and show useful page titles.
- [ ] **All notes** remains progressively disclosed and shows notes across every site.
- [ ] Opening a global note navigates to the correct page.
- [ ] Copying all site notes produces readable Markdown with useful selected/nearby text, not only selectors.
- [ ] Exporting downloads the same complete site-wide Markdown.
- [ ] Hacker News smoke test: annotate two story titles and confirm their titles appear in the export.
- [ ] Clearing site notes removes only that site's notes and requires confirmation.
- [ ] The badge count reflects only the current page.

### Compatibility and quality

- [ ] Test a conventional multi-page site, a React/Vue SPA, Yahoo, Hacker News, and a page with open Shadow DOM.
- [ ] Restricted browser pages fail gracefully without broken controls.
- [ ] Popup, composer, toast, markers, and notes workspace remain legible in light and dark host pages.
- [ ] Keyboard focus order, visible focus, screen-reader labels, and 200% zoom are usable.
- [ ] Reduced-motion mode avoids unnecessary motion.
- [ ] No extension errors appear during the tested flows.
- [ ] The extension makes no unexpected network requests.
- [ ] Clipboard and download actions happen only after an explicit user action.

## 4. Go/no-go gate

- [ ] No known data-loss, duplicate-write, security, privacy, install, or primary-flow bug remains.
- [ ] Chrome, Firefox, Edge, and Arc pass every core test.
- [ ] Safari either passes its own packaged-app QA or is explicitly held for the next release; it never silently ships with a broken notes workspace.
- [ ] Store permission and data-use answers match `PRIVACY.md` and the packaged manifests.
- [ ] Michael gives an explicit **go** in the release issue.

## 5. Build and inspect immutable packages

```sh
bun run release:verify
bun run release:package
shasum -a 256 .output/app-notes-*.zip
```

Expected web-store artifacts:

- `app-notes-<version>-chrome.zip` — Chrome and Edge; also the Arc QA build.
- `app-notes-<version>-firefox.zip` — Firefox extension.
- `app-notes-<version>-sources.zip` — Firefox reviewer source.

- [ ] Unzip every artifact and inspect `manifest.json`, icons, version, permissions, and package contents.
- [ ] Confirm no `.env` file, credential, development log, or unrelated handoff file is present.
- [ ] Rebuild the Firefox package from its source ZIP by following `SOURCE_CODE_REVIEW.md`; compare contents and explain any nondeterministic metadata if necessary.
- [ ] Record SHA-256 hashes in the release issue and GitHub Release.

Safari packaging is a separate macOS step:

```sh
bun run package:safari
```

- [ ] Open `.output/safari-project/App Notes/App Notes.xcodeproj` in Xcode, set the signing team, set marketing version/build number to the release values, and archive the macOS app.
- [ ] Validate the archive and upload it to App Store Connect.
- [ ] Keep iPhone/iPad distribution out of v0.1 unless it receives separate interaction and layout QA.

Apple reference: [package a Safari web extension](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari) and [upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).

## 6. Store materials

- [ ] Final one-sentence summary and concise description.
- [ ] Support URL: `https://github.com/plannotator/app-notes/issues`.
- [ ] Privacy URL: `https://github.com/plannotator/app-notes/blob/main/PRIVACY.md`.
- [ ] Category, language, homepage, AGPL-3.0 license, and Michael Ramos attribution are consistent.
- [ ] At least one polished 1280×800 screenshot; aim for three: annotation composer, site notes, and all notes.
- [ ] Chrome small promo tile at 440×280.
- [ ] Store icon at 128×128 with sufficient transparent padding.
- [ ] Plain reviewer notes explain that all data is local, how to enable annotations, how to open notes, and how to test multi-page persistence.
- [ ] Permission explanations cover `storage`, `activeTab`, `tabs`, `webNavigation`, and Chrome's `sidePanel`.

Chrome asset reference: [supplying images](https://developer.chrome.com/docs/webstore/images). Edge listing reference: [extension listing](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## 7. Submit in parallel

### Chrome

- [ ] Create the first listing manually, upload the Chrome ZIP, complete privacy/data disclosures, and submit for review.
- [ ] Use trusted testers before public publication if another external QA pass is useful.
- [ ] Expect variable review time; Chrome currently warns that elevated submission volume can extend reviews.

### Firefox

- [ ] Upload the Firefox ZIP as a listed add-on.
- [ ] Upload the matching sources ZIP and enter the exact build instructions from `SOURCE_CODE_REVIEW.md`.
- [ ] Choose AGPL-3.0, complete listing/support fields, and submit.
- [ ] If outside testers need a signed build before the listed release, use AMO's unlisted signing flow; do not distribute an unsigned XPI as the normal install.

### Edge

- [ ] Create the listing in Partner Center and upload the exact Chrome ZIP.
- [ ] Complete privacy, permission, remote-code, and data-use declarations.
- [ ] Add reviewer notes and submit for certification.

### Arc

- [ ] No separate submission. Install the Chrome Web Store listing in Arc and repeat the release smoke test after Chrome publishes.

### Safari

- [ ] Create the App Store Connect record, attach the signed macOS build, complete privacy/listing information, and submit to App Review.
- [ ] Do not block the web-extension stores on Safari unless a coordinated same-day launch is commercially important.

## 8. While approvals are pending

- [ ] Publish one GitHub prerelease tied to the frozen commit and include hashes plus clear “technical testers” sideload instructions.
- [ ] Chrome, Edge, and Arc testers load the unpacked `.output/chrome-mv3` directory.
- [ ] Firefox developers use `about:debugging` for a temporary install; broader testers use only an AMO-signed unlisted build.
- [ ] Safari testers use the locally signed Xcode build.
- [ ] Accept only release-blocking fixes. For each fix: bump the version, rerun the full checklist, rebuild every package, and resubmit affected stores.
- [ ] Track each store's submission date, status, review message, listing ID, and public URL in the release issue.

## 9. Publish and follow through

- [ ] Publish independently as each approved listing is ready unless launch coordination has a concrete benefit.
- [ ] Tag the approved commit `v<version>` and create a GitHub Release with hashes and short user-facing notes.
- [ ] Replace the README's “coming soon” links with direct store URLs.
- [ ] Install each public store build and run a five-minute smoke test; store builds are the final artifact, not the local ZIP.
- [ ] Record store IDs and configure `wxt submit init` plus encrypted GitHub secrets for future updates.
- [ ] For later releases, use WXT submission automation for Chrome, Firefox, and Edge; keep Safari on its signed Xcode/App Store Connect workflow.
- [ ] Monitor issues and store crash/review feedback for 72 hours. Fix data loss or install failures immediately.
