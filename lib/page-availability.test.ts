import { describe, expect, test } from 'bun:test';
import {
  parsePageReloadAttempt,
  resolveUnreachablePageAvailability,
} from './page-availability';

describe('unreachable page availability', () => {
  test('offers a reload for a website tab with no content script', () => {
    expect(resolveUnreachablePageAvailability(7, 'https://example.com/a', null))
      .toBe('page-reload-required');
  });

  test('keeps the local-file reload flow', () => {
    expect(resolveUnreachablePageAvailability(7, 'file:///tmp/a.html', null))
      .toBe('file-reload-required');
  });

  test.each([
    'https://chromewebstore.google.com/detail/app-notes/lkknpieefdjpoancolcioblkpgnhpffl',
    'https://chrome.google.com/webstore/category/extensions',
    'https://microsoftedge.microsoft.com/addons/detail/example',
    'https://addons.mozilla.org/en-US/firefox/',
  ])('never offers a reload on a browser store page: %s', (url) => {
    expect(resolveUnreachablePageAvailability(7, url, null)).toBe('unsupported');
  });

  test('offers a reload on other pages of hosts that only block a store path', () => {
    expect(resolveUnreachablePageAvailability(7, 'https://chrome.google.com/intl/en/chrome/', null))
      .toBe('page-reload-required');
    expect(resolveUnreachablePageAvailability(7, 'https://microsoftedge.microsoft.com/other', null))
      .toBe('page-reload-required');
  });

  test('stops offering a reload once that page stayed silent after one', () => {
    const url = 'https://blocked-by-policy.example/';
    expect(resolveUnreachablePageAvailability(7, url, { tabId: 7, url })).toBe('unsupported');
  });

  test('still offers a reload for a different tab or page', () => {
    const url = 'https://example.com/a';
    expect(resolveUnreachablePageAvailability(8, url, { tabId: 7, url }))
      .toBe('page-reload-required');
    expect(resolveUnreachablePageAvailability(7, 'https://example.com/b', { tabId: 7, url }))
      .toBe('page-reload-required');
  });
});

describe('page reload attempt parsing', () => {
  test('parses a valid attempt as a fresh DTO', () => {
    expect(parsePageReloadAttempt(JSON.stringify({
      tabId: 7,
      url: 'https://example.com/',
      ignored: true,
    }))).toEqual({ tabId: 7, url: 'https://example.com/' });
  });

  test.each([
    null,
    '',
    'not json',
    'null',
    '[]',
    '{"tabId":-1,"url":"https://example.com/"}',
    '{"tabId":1.5,"url":"https://example.com/"}',
    '{"tabId":"7","url":"https://example.com/"}',
    '{"tabId":7}',
  ])('rejects malformed input: %s', (input) => {
    expect(parsePageReloadAttempt(input)).toBeNull();
  });
});
