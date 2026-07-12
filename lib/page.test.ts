import { describe, expect, test } from 'bun:test';
import {
  getAnnotationStorageKey,
  getAnnotationStorageKeyForUrl,
  getAnnotationStoragePrefix,
  getAnnotationStoragePrefixForUrl,
  getPageDisplayLabel,
  getSiteDisplayLabel,
  parsePageId,
  parseSiteId,
} from './page';

describe('page identity', () => {
  test('uses origin and pathname as the page identity', () => {
    const pageId = parsePageId('https://www.yahoo.com/news/world');

    expect(pageId?.toString()).toBe('https://www.yahoo.com/news/world');
    expect(pageId === null ? null : getAnnotationStorageKey(pageId)).toBe(
      'annotations:https://www.yahoo.com/news/world',
    );
  });

  test('intentionally ignores query parameters and fragments', () => {
    const plain = getAnnotationStorageKeyForUrl('https://www.yahoo.com/news');
    const transient = getAnnotationStorageKeyForUrl(
      'https://www.yahoo.com/news?guccounter=1#latest',
    );

    expect(transient).toBe(plain);
  });

  test('keeps different origins and pathnames isolated', () => {
    expect(getAnnotationStorageKeyForUrl('https://news.yahoo.com/story')).not.toBe(
      getAnnotationStorageKeyForUrl('https://www.yahoo.com/story'),
    );
    expect(getAnnotationStorageKeyForUrl('https://www.yahoo.com/news')).not.toBe(
      getAnnotationStorageKeyForUrl('https://www.yahoo.com/finance'),
    );
  });

  test('groups every pathname on the same origin under one site prefix', () => {
    const siteId = parseSiteId('https://www.yahoo.com/news/world?edition=us');

    expect(siteId?.toString()).toBe('https://www.yahoo.com');
    expect(siteId === null ? null : getAnnotationStoragePrefix(siteId)).toBe(
      'annotations:https://www.yahoo.com/',
    );
    expect(getAnnotationStoragePrefixForUrl('https://www.yahoo.com/finance')).toBe(
      getAnnotationStoragePrefixForUrl('https://www.yahoo.com/news'),
    );
  });

  test('keeps website prefixes isolated by exact origin', () => {
    expect(getAnnotationStoragePrefixForUrl('https://www.yahoo.com/news')).not.toBe(
      getAnnotationStoragePrefixForUrl('https://news.yahoo.com/story'),
    );
    expect(getAnnotationStoragePrefixForUrl('https://example.com/page')).not.toBe(
      getAnnotationStoragePrefixForUrl('https://example.com:8443/page'),
    );
  });

  test('uses the canonical local file URL as a page identity', () => {
    const url = 'file:///Users/ramos/workspaces/design/My%20Review/index.html?mode=edit#hero';

    expect(parsePageId(url)?.toString()).toBe(
      'file:///Users/ramos/workspaces/design/My%20Review/index.html',
    );
    expect(getAnnotationStorageKeyForUrl(url)).toBe(
      'annotations:file:///Users/ramos/workspaces/design/My%20Review/index.html',
    );
    expect(getPageDisplayLabel(url)).toBe('index.html');
  });

  test('groups local files in the same parent folder as one site', () => {
    const indexUrl = 'file:///Users/ramos/workspaces/design/guided-review/index.html';
    const detailsUrl = 'file:///Users/ramos/workspaces/design/guided-review/details.html';

    expect(parseSiteId(indexUrl)?.toString()).toBe(
      'file:///Users/ramos/workspaces/design/guided-review',
    );
    expect(getAnnotationStoragePrefixForUrl(indexUrl)).toBe(
      'annotations:file:///Users/ramos/workspaces/design/guided-review/',
    );
    expect(getAnnotationStoragePrefixForUrl(detailsUrl)).toBe(
      getAnnotationStoragePrefixForUrl(indexUrl),
    );
    expect(getSiteDisplayLabel(indexUrl)).toBe('guided-review');
  });

  test('keeps local file folders isolated', () => {
    expect(
      getAnnotationStoragePrefixForUrl('file:///Users/ramos/project-a/index.html'),
    ).not.toBe(
      getAnnotationStoragePrefixForUrl('file:///Users/ramos/project-b/index.html'),
    );
  });

  test('handles files stored at the filesystem root', () => {
    expect(getAnnotationStoragePrefixForUrl('file:///review.html')).toBe(
      'annotations:file:///',
    );
    expect(getSiteDisplayLabel('file:///review.html')).toBe('Local files');
  });

  test('rejects unsupported and malformed URLs', () => {
    expect(parsePageId('not a url')).toBeNull();
    expect(parsePageId('chrome://extensions')).toBeNull();
    expect(parsePageId('data:text/html,hello')).toBeNull();
    expect(parseSiteId('chrome://extensions')).toBeNull();
  });
});
