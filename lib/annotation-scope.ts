import {
  getAnnotationStorageKeyForUrl,
  getAnnotationStoragePrefixForUrl,
} from './page';
import type {
  AnnotationStorageKey,
  AnnotationStoragePrefix,
} from './page';

/** The collection of annotations currently shown or acted on by extension UI. */
export type AnnotationScope = 'page' | 'site';

/** The storage identity used to refresh one annotation collection. */
export type AnnotationCollectionIdentity =
  | { readonly _tag: 'page'; readonly key: AnnotationStorageKey }
  | { readonly _tag: 'site'; readonly prefix: AnnotationStoragePrefix };

/** The collection context retained while a notes panel follows tab navigation. */
export interface CurrentAnnotationScope {
  readonly scope: AnnotationScope;
  readonly url: string;
}

/** Return whether the URL identifies a local file. */
export function isLocalFileUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'file:';
  } catch {
    return false;
  }
}

/**
 * Resolve the requested UI scope under App Notes product policy.
 *
 * Websites always keep their existing site-wide behavior. Local files default
 * to one file and may explicitly opt into their parent-folder collection.
 */
export function resolveAnnotationScope(
  url: string,
  requested?: AnnotationScope,
): AnnotationScope {
  if (!isLocalFileUrl(url)) return 'site';
  return requested ?? 'page';
}

/**
 * Resolve scope while a notes panel follows navigation.
 *
 * An explicit local choice persists between sibling files in one folder. A
 * different folder starts safely at the current file again.
 */
export function resolveNavigatedAnnotationScope(
  url: string,
  current?: CurrentAnnotationScope,
  requested?: AnnotationScope,
): AnnotationScope {
  if (requested !== undefined) return resolveAnnotationScope(url, requested);
  if (!isLocalFileUrl(url)) return 'site';
  if (!current || !isLocalFileUrl(current.url)) return 'page';

  const currentFolder = getAnnotationStoragePrefixForUrl(current.url);
  const nextFolder = getAnnotationStoragePrefixForUrl(url);
  return currentFolder !== null && currentFolder === nextFolder ? current.scope : 'page';
}

/** Return the exact storage identity backing a resolved annotation scope. */
export function getAnnotationCollectionIdentity(
  url: string,
  requested?: AnnotationScope,
): AnnotationCollectionIdentity | null {
  const scope = resolveAnnotationScope(url, requested);
  if (scope === 'page') {
    const key = getAnnotationStorageKeyForUrl(url);
    return key === null ? null : { _tag: 'page', key };
  }

  const prefix = getAnnotationStoragePrefixForUrl(url);
  return prefix === null ? null : { _tag: 'site', prefix };
}

/** Return whether one changed storage key belongs to the visible collection. */
export function collectionContainsStorageKey(
  identity: AnnotationCollectionIdentity,
  key: string,
): boolean {
  return identity._tag === 'page' ? key === identity.key : key.startsWith(identity.prefix);
}

/** Return whether two identities address the same annotation collection. */
export function annotationCollectionsEqual(
  left: AnnotationCollectionIdentity | null,
  right: AnnotationCollectionIdentity | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left._tag === 'page') return right._tag === 'page' && left.key === right.key;
  return right._tag === 'site' && left.prefix === right.prefix;
}
