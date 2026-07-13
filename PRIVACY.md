# App Notes Privacy Policy

Effective: July 12, 2026

App Notes is a local-first browser extension. It does not send personal data, browsing activity, notes, screenshots, or analytics to Plannotator or Michael Ramos.

## Data App Notes stores

To restore annotations, App Notes stores the following in the browser's local extension storage:

- notes you write;
- the page URL and title;
- a selector and a small amount of nearby element text used to identify the annotated element;
- screenshot metadata, when a screenshot was saved to a connected local folder;
- annotation creation and update times.

On Chrome, Edge, and Arc, you may optionally connect a real directory with the browser-native File System Access API. When you do, App Notes asks the browser to persist the directory handle and continuously writes `app-notes.md` plus PNG files under `screenshots/` in that directory. The browser controls whether that handle can be persisted and when write permission must be granted again. Screenshot capture is unavailable unless the connected directory currently has write permission. PNG bytes are not retained in extension-private attachment storage.

Firefox and other browsers without the File System Access API do not show the folder connection or screenshot controls. Ordinary text annotations continue to use local extension storage.

This data stays on the device and browser profile where App Notes is installed. App Notes has no account system, advertising, analytics, or Plannotator-operated server.

## When data leaves the extension

Data moves only when you explicitly copy notes to the clipboard, export a Markdown file, or connect a local folder and create or change notes. Files in a connected folder can be read by local applications and agents that have operating-system access to that folder. App Notes does not upload them.

Websites you visit and their own browser behavior remain subject to their privacy policies.

## Retention and deletion

Text annotations remain in the browser's local extension storage until you delete individual notes, clear a site's notes, clear browser extension data, or uninstall App Notes. Connected-folder Markdown is updated as notes change. Screenshot PNGs are removed from the connected folder when their annotations are deleted or cleared. Files copied or moved outside the connected folder are not managed by App Notes.

## Changes

Material changes to this policy will be published in this repository with a new effective date.

## Contact

Questions and privacy requests can be filed through [GitHub Issues](https://github.com/plannotator/app-notes/issues).
