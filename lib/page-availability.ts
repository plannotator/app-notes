import { isLocalFileUrl } from './annotation-scope';

/** What the popup offers when a tab's content script does not answer. */
export type UnreachablePageAvailability =
  | 'file-reload-required'
  | 'page-reload-required'
  | 'unsupported';

/** The page the popup last reloaded to start its content script. */
export interface PageReloadAttempt {
  readonly tabId: number;
  readonly url: string;
}

/** Store pages where browsers never run extension content scripts. */
const BROWSER_STORE_PAGES: ReadonlyArray<{
  readonly hostname: string;
  readonly pathPrefix: string;
}> = [
  { hostname: 'chromewebstore.google.com', pathPrefix: '/' },
  { hostname: 'chrome.google.com', pathPrefix: '/webstore' },
  { hostname: 'microsoftedge.microsoft.com', pathPrefix: '/addons' },
  { hostname: 'addons.mozilla.org', pathPrefix: '/' },
];

function isBrowserStorePage(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    return BROWSER_STORE_PAGES.some((page) => (
      hostname === page.hostname && pathname.startsWith(page.pathPrefix)
    ));
  } catch {
    return false;
  }
}

/**
 * Decide what to offer when an annotatable tab has no content script.
 *
 * Tabs opened before App Notes was installed need one reload. Browsers also
 * block extensions on pages no list can fully name, such as sites restricted by
 * policy, so a page that stays silent after a reload is reported as unavailable
 * instead of offering the same reload forever.
 */
export function resolveUnreachablePageAvailability(
  tabId: number,
  url: string,
  lastAttempt: PageReloadAttempt | null,
): UnreachablePageAvailability {
  if (isLocalFileUrl(url)) return 'file-reload-required';
  if (isBrowserStorePage(url)) return 'unsupported';
  if (lastAttempt?.tabId === tabId && lastAttempt.url === url) return 'unsupported';
  return 'page-reload-required';
}

/** Parse a persisted reload attempt. */
export function parsePageReloadAttempt(input: string | null): PageReloadAttempt | null {
  if (input === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;
  const tabId = Reflect.get(value, 'tabId');
  const url = Reflect.get(value, 'url');
  if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0) return null;
  return typeof url === 'string' ? { tabId, url } : null;
}
