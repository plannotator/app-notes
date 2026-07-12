# App Notes

The source code for App Notes, a local-first browser extension for attaching notes to elements on any website and exporting every note for a site at once.

## Install

- [Chrome Web Store](https://chromewebstore.google.com/) — coming soon
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

[AGPL-3.0](LICENSE) © [Michael Ramos](https://github.com/backnotprop). Distributed by [Plannotator](https://github.com/plannotator).
