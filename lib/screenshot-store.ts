import type { AnnotationScreenshotCapture } from './types';

/** Blob persistence used by annotation screenshot workflows. */
export interface AnnotationScreenshotStore {
  /** Persist one PNG under its stable annotation-owned identifier. */
  readonly save: (capture: AnnotationScreenshotCapture) => Promise<void>;
  /** Read one PNG, returning null when no attachment exists. */
  readonly get: (id: string) => Promise<Blob | null>;
  /** Remove zero or more PNGs idempotently. */
  readonly remove: (ids: ReadonlyArray<string>) => Promise<void>;
}

interface ScreenshotRecord {
  readonly id: string;
  readonly blob: Blob;
}

const DATABASE_NAME = 'app-notes';
const DATABASE_VERSION = 1;
const SCREENSHOT_STORE = 'annotation-screenshots';

/** Create the IndexedDB adapter shared by extension-owned browser contexts. */
export function createIndexedDbScreenshotStore(): AnnotationScreenshotStore {
  let databasePromise: Promise<IDBDatabase> | null = null;

  const getDatabase = (): Promise<IDBDatabase> => {
    databasePromise ??= openScreenshotDatabase();
    return databasePromise;
  };

  return {
    save: async (capture) => {
      const database = await getDatabase();
      const record: ScreenshotRecord = {
        id: capture.id,
        blob: pngDataUrlToBlob(capture.dataUrl),
      };
      await runTransaction(database, 'readwrite', (store) => store.put(record));
    },
    get: async (id) => {
      const database = await getDatabase();
      const result = await runTransaction(database, 'readonly', (store) => store.get(id));
      return parseScreenshotRecord(result, id)?.blob ?? null;
    },
    remove: async (ids) => {
      if (ids.length === 0) return;
      const database = await getDatabase();
      await runTransaction(database, 'readwrite', (store) => {
        for (const id of ids) store.delete(id);
      });
    },
  };
}

/** The production screenshot store for the current extension context. */
export const browserScreenshotStore = createIndexedDbScreenshotStore();

function openScreenshotDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SCREENSHOT_STORE)) {
        database.createObjectStore(SCREENSHOT_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open screenshot storage.'));
    request.onblocked = () => reject(new Error('Screenshot storage upgrade was blocked.'));
  });
}

function runTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest | void,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SCREENSHOT_STORE, mode);
    let request: IDBRequest | void;
    try {
      request = operation(transaction.objectStore(SCREENSHOT_STORE));
    } catch (cause: unknown) {
      transaction.abort();
      reject(cause);
      return;
    }

    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(
      transaction.error ?? new Error('Screenshot storage transaction failed.'),
    );
    transaction.onabort = () => reject(
      transaction.error ?? new Error('Screenshot storage transaction was aborted.'),
    );
  });
}

function parseScreenshotRecord(input: unknown, expectedId: string): ScreenshotRecord | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const id = Reflect.get(input, 'id');
  const blob = Reflect.get(input, 'blob');
  if (id !== expectedId || !(blob instanceof Blob) || blob.type !== 'image/png') return null;
  return { id, blob };
}

function pngDataUrlToBlob(dataUrl: string): Blob {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) throw new Error('Screenshot data is not a PNG data URL.');

  const binary = atob(dataUrl.slice(prefix.length));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/png' });
}
