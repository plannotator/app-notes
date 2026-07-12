declare const pageIdBrand: unique symbol;
declare const siteIdBrand: unique symbol;

/** The canonical identity of one annotatable web or local-file page. */
export type PageId = string & { readonly [pageIdBrand]: 'PageId' };

/** The canonical identity of one web origin or local-file folder workspace. */
export type SiteId = string & { readonly [siteIdBrand]: 'SiteId' };

/** The browser storage key containing annotations for one page. */
export type AnnotationStorageKey = `annotations:${string}`;

/** The storage-key prefix shared by every annotated page on one website. */
export type AnnotationStoragePrefix = `annotations:${string}/`;

/**
 * Parse an HTTP(S) or local-file URL into the page identity used by App Notes.
 *
 * Query parameters and fragments are intentionally excluded so transient URL
 * state does not split annotations for the same origin and pathname.
 */
export function parsePageId(url: string): PageId | null {
  try {
    const parsed = new URL(url);
    if (!isAnnotatableProtocol(parsed.protocol)) return null;

    parsed.search = '';
    parsed.hash = '';
    const pageId = parsed.protocol === 'file:'
      ? parsed.href
      : `${parsed.origin}${parsed.pathname}`;

    // SAFETY: URL parsing and the protocol guard established a canonical,
    // absolute HTTP(S) or local-file page URL without transient state.
    return pageId as PageId;
  } catch {
    return null;
  }
}

/** Parse a URL into its web-origin or local parent-folder workspace identity. */
export function parseSiteId(url: string): SiteId | null {
  try {
    const parsed = new URL(url);
    if (!isAnnotatableProtocol(parsed.protocol)) return null;

    if (parsed.protocol === 'file:') {
      const directory = parsed.pathname.endsWith('/') ? parsed : new URL('.', parsed);
      directory.search = '';
      directory.hash = '';
      const siteId = directory.pathname === '/'
        ? directory.href
        : directory.href.slice(0, -1);

      // SAFETY: URL parsing and the file protocol guard established a canonical
      // absolute directory URL. Non-root directories omit only the trailing slash.
      return siteId as SiteId;
    }

    // SAFETY: URL parsing and the protocol guard established an absolute HTTP(S) origin.
    return parsed.origin as SiteId;
  } catch {
    return null;
  }
}

/** Return a concise user-facing label for an annotatable site workspace. */
export function getSiteDisplayLabel(url: string): string | null {
  const siteId = parseSiteId(url);
  if (siteId === null) return null;

  const parsed = new URL(siteId);
  if (parsed.protocol !== 'file:') return parsed.host;
  if (parsed.pathname === '/') return 'Local files';

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
  const lastSegment = segments.at(-1);
  return lastSegment === undefined ? 'Local files' : decodePathSegment(lastSegment);
}

/** Return a concise user-facing label for an annotatable page. */
export function getPageDisplayLabel(url: string): string | null {
  const pageId = parsePageId(url);
  if (pageId === null) return null;

  const parsed = new URL(pageId);
  if (parsed.protocol !== 'file:') return parsed.pathname === '/' ? 'Home' : parsed.pathname;
  if (parsed.pathname.endsWith('/')) return 'Home';

  const segments = parsed.pathname.split('/').filter((segment) => segment.length > 0);
  const lastSegment = segments.at(-1);
  return lastSegment === undefined ? 'Local file' : decodePathSegment(lastSegment);
}

/** Return the browser storage key for a parsed page identity. */
export function getAnnotationStorageKey(pageId: PageId): AnnotationStorageKey {
  return `annotations:${pageId}`;
}

/** Return the exact storage prefix shared by all pages on a website. */
export function getAnnotationStoragePrefix(siteId: SiteId): AnnotationStoragePrefix {
  const prefix = `annotations:${siteId}${siteId.endsWith('/') ? '' : '/'}`;
  // SAFETY: the conditional suffix guarantees exactly one trailing slash.
  return prefix as AnnotationStoragePrefix;
}

/** Parse a URL and return its annotation storage key, or null when unsupported. */
export function getAnnotationStorageKeyForUrl(url: string): AnnotationStorageKey | null {
  const pageId = parsePageId(url);
  return pageId === null ? null : getAnnotationStorageKey(pageId);
}

/** Parse a URL and return its website annotation prefix, or null when unsupported. */
export function getAnnotationStoragePrefixForUrl(url: string): AnnotationStoragePrefix | null {
  const siteId = parseSiteId(url);
  return siteId === null ? null : getAnnotationStoragePrefix(siteId);
}

function isAnnotatableProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:' || protocol === 'file:';
}

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
