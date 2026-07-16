# App Notes

The source code for App Notes, a local-first browser extension for attaching notes to elements on any website and exporting every note for a site at once.

## Install

- [Chrome Web Store]([https://chromewebstore.google.com/](https://chromewebstore.google.com/detail/app-notes/lkknpieefdjpoancolcioblkpgnhpffl)) — Released! 🎉
- [Firefox Add-ons](https://addons.mozilla.org/firefox/) — coming soon
- [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/) — coming soon

Arc can install the Chrome release. Safari is planned after compatibility QA and App Store packaging.

## Development

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run dev
```

Run `bun test` and `bun run build` before submitting changes.

For local `file://` pages, enable **Allow access to file URLs** in App Notes' Chrome extension settings, then reload the file.

See the [release checklist](docs/RELEASE_CHECKLIST.md) and [privacy policy](PRIVACY.md).

## License

Source available under the [PolyForm Shield License 1.0.0](LICENSE). You may not use the software to provide a competing product.

© [Michael Ramos](https://github.com/backnotprop). Distributed by [Plannotator](https://github.com/plannotator). Project branding is covered by the [trademark notice](TRADEMARKS.md).

Versions published at or before [`4da99d6`](https://github.com/plannotator/app-notes/commit/4da99d6) remain available under AGPL-3.0-only, the license that accompanied those versions.
