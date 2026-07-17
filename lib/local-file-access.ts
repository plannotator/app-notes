/** Storage key for the tab awaiting Chrome's local-file approval. */
export const PENDING_LOCAL_FILE_ACCESS_TAB_KEY = 'app-notes:pending-local-file-access-tab';

/** User-initiated request to open App Notes' browser-managed file-access setting. */
export interface OpenLocalFileSettingsCommand {
  readonly type: 'app-notes-open-local-file-settings';
  readonly tabId: number;
}

/** Result returned after attempting to open the browser-managed setting. */
export type OpenLocalFileSettingsResult =
  | { readonly _tag: 'opened' }
  | { readonly _tag: 'failed' };

/** Parse an unknown runtime message into a local-file settings request. */
export function parseOpenLocalFileSettingsCommand(
  input: unknown,
): OpenLocalFileSettingsCommand | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  if (Reflect.get(input, 'type') !== 'app-notes-open-local-file-settings') return null;
  const tabId = Reflect.get(input, 'tabId');
  if (typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0) return null;
  return { type: 'app-notes-open-local-file-settings', tabId };
}

/** Parse the browser response to a local-file settings request. */
export function parseOpenLocalFileSettingsResult(
  input: unknown,
): OpenLocalFileSettingsResult | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const tag = Reflect.get(input, '_tag');
  if (tag === 'opened' || tag === 'failed') return { _tag: tag };
  return null;
}

/** Parse a persisted pending tab identifier. */
export function parsePendingLocalFileAccessTab(input: unknown): number | null {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 0
    ? input
    : null;
}

/** Return Chrome's detail page for this extension's file-access toggle. */
export function getLocalFileSettingsUrl(extensionId: string): string {
  return `chrome://extensions/?id=${encodeURIComponent(extensionId)}`;
}
