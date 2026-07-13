import { parseSiteId } from './page';
import { formatSiteAnnotationsMarkdown } from './storage';
import { createAnnotationScreenshotPath } from './types';
import type { Annotation, AnnotationScreenshotCapture } from './types';

/** The user-visible state of the optional local-folder connection. */
export type LocalFolderState =
  | { readonly _tag: 'unsupported' }
  | { readonly _tag: 'disconnected' }
  | { readonly _tag: 'reconnect'; readonly name: string }
  | { readonly _tag: 'connected'; readonly name: string }
  | { readonly _tag: 'sync-error'; readonly name: string; readonly message: string };

/** Persistence boundary for a structured-cloneable directory handle and sync status. */
export interface LocalFolderRepository {
  readonly load: () => Promise<LocalFolderConnection | null>;
  readonly save: (connection: LocalFolderConnection) => Promise<void>;
  readonly clear: () => Promise<void>;
}

/** The persisted local-folder connection. */
export interface LocalFolderConnection {
  readonly handle: AppNotesFileSystemDirectoryHandle;
  readonly syncError: string | null;
}

/** Runtime notification emitted after the connected-folder state changes. */
export interface LocalFolderStateChangedMessage {
  readonly type: 'app-notes:local-folder/state-changed';
  readonly state: LocalFolderState;
}

/** Folder capability used by annotation persistence and extension UI. */
export interface LocalFolderWorkspace {
  readonly connect: (
    handle: AppNotesFileSystemDirectoryHandle,
    annotations: ReadonlyArray<Annotation>,
  ) => Promise<LocalFolderState>;
  readonly disconnect: () => Promise<LocalFolderState>;
  readonly reconnect: (annotations: ReadonlyArray<Annotation>) => Promise<LocalFolderState>;
  readonly getState: () => Promise<LocalFolderState>;
  readonly removeScreenshots: (ids: ReadonlyArray<string>) => Promise<void>;
  readonly sync: (annotations: ReadonlyArray<Annotation>) => Promise<void>;
  readonly writeScreenshot: (capture: AnnotationScreenshotCapture) => Promise<string | null>;
}

const DATABASE_NAME = 'app-notes-local-folder';
const LEGACY_SCREENSHOT_DATABASE_NAME = 'app-notes';
const DATABASE_VERSION = 1;
const CONNECTION_STORE = 'connection';
const CONNECTION_ID = 'local-folder';
const MARKDOWN_FILENAME = 'app-notes.md';
const SCREENSHOTS_DIRECTORY = 'screenshots';
const SYNC_ERROR_MESSAGE = 'Couldn’t sync notes to the connected folder.';

/** Create the local-folder capability around a repository and browser support decision. */
export function createLocalFolderWorkspace(
  repository: LocalFolderRepository,
  supported: boolean,
  onStateChanged: (state: LocalFolderState) => Promise<void> = async () => undefined,
): LocalFolderWorkspace {
  const getConnectionWithPermission = async (): Promise<LocalFolderConnection | null> => {
    if (!supported) return null;
    const connection = await repository.load();
    if (connection === null) return null;
    const permission = await queryWritePermission(connection.handle);
    if (permission === 'granted') return connection;
    await onStateChanged({ _tag: 'reconnect', name: connection.handle.name });
    return null;
  };

  const recordSyncError = async (
    connection: LocalFolderConnection,
    syncError: string | null,
  ): Promise<void> => {
    const nextConnection = { handle: connection.handle, syncError };
    await repository.save(nextConnection);
    await onStateChanged(stateFromConnection(nextConnection, true));
  };

  const sync = async (annotations: ReadonlyArray<Annotation>): Promise<void> => {
    const connection = await getConnectionWithPermission();
    if (connection === null) return;

    try {
      await writeWorkspaceMarkdown(connection.handle, annotations);
      await recordSyncError(connection, null);
    } catch {
      await recordSyncError(connection, SYNC_ERROR_MESSAGE);
    }
  };

  return {
    connect: async (handle, annotations) => {
      if (!supported) return { _tag: 'unsupported' };
      const permission = await requestWritePermission(handle);
      const connection: LocalFolderConnection = { handle, syncError: null };
      await repository.save(connection);
      if (permission !== 'granted') return { _tag: 'reconnect', name: handle.name };
      await sync(annotations);
      return stateFromConnection(await repository.load(), true);
    },
    disconnect: async () => {
      if (!supported) return { _tag: 'unsupported' };
      await repository.clear();
      const state: LocalFolderState = { _tag: 'disconnected' };
      await onStateChanged(state);
      return state;
    },
    reconnect: async (annotations) => {
      if (!supported) return { _tag: 'unsupported' };
      const connection = await repository.load();
      if (connection === null) return { _tag: 'disconnected' };
      const permission = await requestWritePermission(connection.handle);
      if (permission !== 'granted') return { _tag: 'reconnect', name: connection.handle.name };
      await sync(annotations);
      return stateFromConnection(await repository.load(), true);
    },
    getState: async () => {
      if (!supported) return { _tag: 'unsupported' };
      const connection = await repository.load();
      if (connection === null) return { _tag: 'disconnected' };
      const permission = await queryWritePermission(connection.handle);
      return stateFromConnection(connection, permission === 'granted');
    },
    removeScreenshots: async (ids) => {
      if (ids.length === 0) return;
      const connection = await getConnectionWithPermission();
      if (connection === null) return;
      try {
        const directory = await connection.handle.getDirectoryHandle(SCREENSHOTS_DIRECTORY);
        await Promise.all(ids.map(async (id) => {
          try {
            await directory.removeEntry(screenshotFilename(id));
          } catch {
            // Removal is idempotent; a missing screenshot already satisfies the operation.
          }
        }));
      } catch {
        // A missing screenshots directory already satisfies the operation.
      }
    },
    sync,
    writeScreenshot: async (capture) => {
      const connection = await getConnectionWithPermission();
      if (connection === null) return null;
      try {
        const path = createAnnotationScreenshotPath(capture.id);
        const directory = await connection.handle.getDirectoryHandle(
          SCREENSHOTS_DIRECTORY,
          { create: true },
        );
        await writeFile(
          directory,
          screenshotFilename(capture.id),
          pngDataUrlToBlob(capture.dataUrl),
        );
        return path;
      } catch {
        await recordSyncError(connection, SYNC_ERROR_MESSAGE);
        return null;
      }
    },
  };
}

/** Create the IndexedDB repository used by extension-owned Chromium contexts. */
export function createIndexedDbLocalFolderRepository(): LocalFolderRepository {
  let databasePromise: Promise<IDBDatabase> | null = null;
  const getDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openDatabase();
    return databasePromise;
  };

  return {
    load: async () => {
      const database = await getDatabase();
      const result = await runTransaction(database, 'readonly', (store) => store.get(CONNECTION_ID));
      return parseConnectionRecord(result);
    },
    save: async (connection) => {
      const database = await getDatabase();
      const record: ConnectionRecord = { id: CONNECTION_ID, ...connection };
      await runTransaction(database, 'readwrite', (store) => store.put(record));
    },
    clear: async () => {
      const database = await getDatabase();
      await runTransaction(database, 'readwrite', (store) => store.delete(CONNECTION_ID));
    },
  };
}

/** Whether this extension page can invoke the browser-native directory picker. */
export function canChooseLocalFolder(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}

/** Open the native directory picker. This must be called directly from a user gesture. */
export async function chooseLocalFolder(): Promise<AppNotesFileSystemDirectoryHandle | null> {
  if (window.showDirectoryPicker === undefined) return null;
  try {
    return await window.showDirectoryPicker({ id: 'app-notes-workspace', mode: 'readwrite' });
  } catch (cause: unknown) {
    if (isAbortError(cause)) return null;
    throw cause;
  }
}

/** Remove screenshot bytes left by the retired extension-private attachment store. */
export function deleteLegacyScreenshotStorage(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(LEGACY_SCREENSHOT_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to remove legacy screenshots.'));
    request.onblocked = () => reject(new Error('Legacy screenshot removal was blocked.'));
  });
}

/** The production local-folder repository shared by extension contexts. */
export const browserLocalFolderRepository = createIndexedDbLocalFolderRepository();

/** Parse a local-folder state crossing the extension runtime boundary. */
export function parseLocalFolderState(input: unknown): LocalFolderState | null {
  if (!isRecord(input) || typeof input._tag !== 'string') return null;
  switch (input._tag) {
    case 'unsupported':
    case 'disconnected':
      return Object.keys(input).length === 1 ? { _tag: input._tag } : null;
    case 'reconnect':
    case 'connected':
      return Object.keys(input).length === 2 && typeof input.name === 'string'
        ? { _tag: input._tag, name: input.name }
        : null;
    case 'sync-error':
      return Object.keys(input).length === 3
        && typeof input.name === 'string'
        && typeof input.message === 'string'
        ? { _tag: input._tag, name: input.name, message: input.message }
        : null;
    default:
      return null;
  }
}

/** Parse a connected-folder state notification from another extension context. */
export function parseLocalFolderStateChangedMessage(
  input: unknown,
): LocalFolderStateChangedMessage | null {
  if (!isRecord(input) || !hasExactKeys(input, ['type', 'state'])) return null;
  if (input.type !== 'app-notes:local-folder/state-changed') return null;
  const state = parseLocalFolderState(input.state);
  return state === null ? null : { type: input.type, state };
}

/** Request the authoritative local-folder state from the background capability owner. */
export async function getBrowserLocalFolderState(): Promise<LocalFolderState> {
  try {
    const response: unknown = await browser.runtime.sendMessage({
      type: 'app-notes:local-folder/state',
    });
    return parseLocalFolderState(response) ?? { _tag: 'unsupported' };
  } catch {
    return { _tag: 'unsupported' };
  }
}

/** Notify open extension surfaces that folder permission or sync state changed. */
export async function broadcastLocalFolderState(state: LocalFolderState): Promise<void> {
  const message: LocalFolderStateChangedMessage = {
    type: 'app-notes:local-folder/state-changed',
    state,
  };
  await browser.runtime.sendMessage(message).catch(() => undefined);
}

interface ConnectionRecord extends LocalFolderConnection {
  readonly id: typeof CONNECTION_ID;
}

function stateFromConnection(
  connection: LocalFolderConnection | null,
  permissionGranted: boolean,
): LocalFolderState {
  if (connection === null) return { _tag: 'disconnected' };
  if (!permissionGranted) return { _tag: 'reconnect', name: connection.handle.name };
  return connection.syncError === null
    ? { _tag: 'connected', name: connection.handle.name }
    : { _tag: 'sync-error', name: connection.handle.name, message: connection.syncError };
}

async function queryWritePermission(
  handle: AppNotesFileSystemDirectoryHandle,
): Promise<PermissionState> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

async function requestWritePermission(
  handle: AppNotesFileSystemDirectoryHandle,
): Promise<PermissionState> {
  try {
    return await handle.requestPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

async function writeWorkspaceMarkdown(
  handle: AppNotesFileSystemDirectoryHandle,
  annotations: ReadonlyArray<Annotation>,
): Promise<void> {
  const markdown = formatAllAnnotationsMarkdown(annotations);
  await writeFile(handle, MARKDOWN_FILENAME, markdown);
}

/** Format all local notes as deterministic Markdown with local PNG references. */
export function formatAllAnnotationsMarkdown(annotations: ReadonlyArray<Annotation>): string {
  if (annotations.length === 0) return '# App Notes\n\nNo annotations yet.\n';

  const groups = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const siteId = parseSiteId(annotation.url);
    if (siteId === null) continue;
    const group = groups.get(siteId) ?? [];
    group.push(annotation);
    groups.set(siteId, group);
  }

  const sections: string[] = [];
  for (const [, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const representative = group[0];
    if (representative === undefined) continue;
    sections.push(formatSiteAnnotationsMarkdown(representative.url, group, {
      nested: true,
      screenshotPath: (annotation) => annotation.screenshot === undefined
        ? null
        : annotation.screenshot.path,
    }));
  }
  return `# App Notes\n\n${sections.join('\n')}`;
}

async function writeFile(
  directory: AppNotesFileSystemDirectoryHandle,
  filename: string,
  data: Blob | string,
): Promise<void> {
  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(data);
    await writable.close();
  } catch (cause: unknown) {
    try {
      await writable.abort();
    } catch {
      // Preserve the original write failure.
    }
    throw cause;
  }
}

function screenshotFilename(id: string): string {
  return createAnnotationScreenshotPath(id).slice(`${SCREENSHOTS_DIRECTORY}/`.length);
}

function pngDataUrlToBlob(dataUrl: string): Blob {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('Screenshot data is not a PNG data URL.');
  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: 'image/png' });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CONNECTION_STORE)) {
        request.result.createObjectStore(CONNECTION_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local-folder storage.'));
    request.onblocked = () => reject(new Error('Local-folder storage upgrade was blocked.'));
  });
}

function runTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CONNECTION_STORE, mode);
    let request: IDBRequest;
    try {
      request = operation(transaction.objectStore(CONNECTION_STORE));
    } catch (cause: unknown) {
      transaction.abort();
      reject(cause);
      return;
    }
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Local-folder transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Local-folder transaction was aborted.'));
  });
}

function parseConnectionRecord(input: unknown): LocalFolderConnection | null {
  if (!isRecord(input) || input.id !== CONNECTION_ID) return null;
  if (!isDirectoryHandle(input.handle)) return null;
  if (input.syncError !== null && typeof input.syncError !== 'string') return null;
  return { handle: input.handle, syncError: input.syncError };
}

function isDirectoryHandle(input: unknown): input is AppNotesFileSystemDirectoryHandle {
  if (!isRecord(input)) return false;
  return input.kind === 'directory'
    && typeof input.name === 'string'
    && typeof input.getDirectoryHandle === 'function'
    && typeof input.getFileHandle === 'function'
    && typeof input.queryPermission === 'function'
    && typeof input.removeEntry === 'function'
    && typeof input.requestPermission === 'function';
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, expected: ReadonlyArray<string>): boolean {
  const keys = Object.keys(input);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(input, key));
}

function isAbortError(input: unknown): boolean {
  return input instanceof DOMException && input.name === 'AbortError';
}
