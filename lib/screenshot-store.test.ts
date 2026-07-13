import 'fake-indexeddb/auto';
import { describe, expect, test } from 'bun:test';
import { createIndexedDbScreenshotStore } from './screenshot-store';

describe('IndexedDB screenshot storage', () => {
  test('round-trips and removes a PNG blob by annotation id', async () => {
    const store = createIndexedDbScreenshotStore();
    const id = `screenshot-${crypto.randomUUID()}`;

    await store.save({
      id,
      mimeType: 'image/png',
      width: 2,
      height: 2,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });

    const blob = await store.get(id);
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBeGreaterThan(0);

    await store.remove([id]);
    expect(await store.get(id)).toBeNull();
  });
});
