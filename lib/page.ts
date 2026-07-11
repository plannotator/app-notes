declare const pageIdBrand: unique symbol;
declare const siteIdBrand: unique symbol;

/** The canonical identity of one annotatable web page. */
export type PageId = string & { readonly [pageIdBrand]: 'PageId' };

/** The canonical identity of one annotatable website (its URL origin). */
export type SiteId = string & { readonly [siteIdBrand]: 'SiteId' };

/** The browser storage key containing annotations for one page. */
export type AnnotationStorageKey = `annotations:${string}`;

/** The storage-key prefix shared by every annotated page on one website. */
export type AnnotationStoragePrefix = `annotations:${string}/`;

/**
 * Parse an HTTP(S) URL into the page identity used by App Notes.
 *
 * Query parameters and fragments are intentionally excluded so transient URL
 * state does not split annotations for the same origin and pathname.
 */
export function parsePageId(url: string): PageId | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    const pageId = `${parsed.origin}${parsed.pathname}`;
    // SAFETY: URL parsing established an absolute HTTP(S) origin and pathname.
    return pageId as PageId;
  } catch {
    return null;
  }
}

/** Parse an HTTP(S) URL into the website identity used by App Notes. */
export function parseSiteId(url: string): SiteId | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    // SAFETY: URL parsing established an absolute HTTP(S) origin.
    return parsed.origin as SiteId;
  } catch {
    return null;
  }
}

/** Return the browser storage key for a parsed page identity. */
export function getAnnotationStorageKey(pageId: PageId): AnnotationStorageKey {
  return `annotations:${pageId}`;
}

/** Return the exact storage prefix shared by all pages on a website. */
export function getAnnotationStoragePrefix(siteId: SiteId): AnnotationStoragePrefix {
  return `annotations:${siteId}/`;
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
