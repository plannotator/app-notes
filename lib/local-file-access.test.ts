import { describe, expect, test } from 'bun:test';
import {
  getLocalFileSettingsUrl,
  parseOpenLocalFileSettingsCommand,
  parseOpenLocalFileSettingsResult,
  parsePendingLocalFileAccessTab,
} from './local-file-access';

describe('local file access protocol', () => {
  test('parses a valid settings request as a fresh DTO', () => {
    expect(parseOpenLocalFileSettingsCommand({
      type: 'app-notes-open-local-file-settings',
      tabId: 42,
      ignored: 'outside the protocol',
    })).toEqual({ type: 'app-notes-open-local-file-settings', tabId: 42 });
  });

  test('rejects malformed settings requests and responses', () => {
    expect(parseOpenLocalFileSettingsCommand(null)).toBeNull();
    expect(parseOpenLocalFileSettingsCommand({
      type: 'app-notes-open-local-file-settings',
      tabId: -1,
    })).toBeNull();
    expect(parseOpenLocalFileSettingsCommand({
      type: 'app-notes-open-local-file-settings',
      tabId: '42',
    })).toBeNull();
    expect(parseOpenLocalFileSettingsResult({ ok: true })).toBeNull();
  });

  test('parses only the supported settings results', () => {
    expect(parseOpenLocalFileSettingsResult({ _tag: 'opened' })).toEqual({ _tag: 'opened' });
    expect(parseOpenLocalFileSettingsResult({ _tag: 'failed' })).toEqual({ _tag: 'failed' });
  });

  test('parses persisted tab identifiers and creates the settings URL', () => {
    expect(parsePendingLocalFileAccessTab(42)).toBe(42);
    expect(parsePendingLocalFileAccessTab('42')).toBeNull();
    expect(getLocalFileSettingsUrl('extension-id')).toBe(
      'chrome://extensions/?id=extension-id',
    );
  });
});
