import { describe, expect, test } from 'bun:test';
import {
  getAnnotationStorageKey,
  getAnnotationStorageKeyForUrl,
  getAnnotationStoragePrefix,
  getAnnotationStoragePrefixForUrl,
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

  test('rejects unsupported and malformed URLs', () => {
    expect(parsePageId('not a url')).toBeNull();
    expect(parsePageId('chrome://extensions')).toBeNull();
    expect(parsePageId('file:///tmp/page.html')).toBeNull();
    expect(parseSiteId('chrome://extensions')).toBeNull();
  });
});
