import { describe, expect, test } from 'bun:test';
import { getAnnotationStorageKeyForUrl } from './page';
import {
  createAnnotationClient,
  createAnnotationStorage,
  formatSiteAnnotationsMarkdown,
} from './storage';
import type {
  Annotation,
  AnnotationCreatePayload,
  AnnotationMutationCommand,
} from './types';
import type {
  AnnotationRuntimeTransport,
  AnnotationStorageArea,
  AnnotationStorageDependencies,
} from './storage';

const PAGE_URL = 'https://www.yahoo.com/news';

describe('annotation storage', () => {
  test('preserves two concurrent creates', async () => {
    const area = new InMemoryStorageArea();
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([100, 200]),
    );

    const [first, second] = await Promise.all([
      storage.execute(createCommand('first')),
      storage.execute(createCommand('second')),
    ]);

    expect(first._tag).toBe('created');
    expect(second._tag).toBe('created');
    expect((await storage.getAnnotations(PAGE_URL)).map((annotation) => annotation.note)).toEqual([
      'first',
      'second',
    ]);
  });

  test('orders create then clear deterministically', async () => {
    const area = new InMemoryStorageArea();
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([100]),
    );

    await Promise.all([
      storage.execute(createCommand('created before clear')),
      storage.execute({ type: 'app-notes:annotation/clear', url: PAGE_URL }),
    ]);

    expect(await storage.getAnnotations(PAGE_URL)).toEqual([]);
  });

  test('orders clear then create deterministically', async () => {
    const area = new InMemoryStorageArea();
    const key = getAnnotationStorageKeyForUrl(PAGE_URL);
    if (key === null) throw new Error('Expected a supported test URL');
    area.seed(key, [annotationFixture('existing', 'old note')]);
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([200]),
    );

    await Promise.all([
      storage.execute({ type: 'app-notes:annotation/clear', url: PAGE_URL }),
      storage.execute(createCommand('created after clear')),
    ]);

    const annotations = await storage.getAnnotations(PAGE_URL);
    expect(annotations.map((annotation) => annotation.note)).toEqual(['created after clear']);
  });

  test('filters corrupt persisted rows', async () => {
    const area = new InMemoryStorageArea();
    const key = getAnnotationStorageKeyForUrl(PAGE_URL);
    if (key === null) throw new Error('Expected a supported test URL');
    const valid = annotationFixture('valid', 'keep me');
    area.seed(key, [
      valid,
      null,
      { ...valid, id: '' },
      { ...valid, updatedAt: 'later' },
      { ...valid, anchor: { selector: '#missing-fields' } },
    ]);
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([100]),
    );

    expect(await storage.getAnnotations(PAGE_URL)).toEqual([valid]);
  });

  test('reads every page on one website without leaking another origin', async () => {
    const area = new InMemoryStorageArea();
    const newsKey = getRequiredKey(PAGE_URL);
    const financeUrl = 'https://www.yahoo.com/finance?guccounter=1';
    const financeKey = getRequiredKey(financeUrl);
    const otherUrl = 'https://news.yahoo.com/story';
    const otherKey = getRequiredKey(otherUrl);
    area.seed(newsKey, [annotationFixture('news', 'news note')]);
    area.seed(financeKey, [annotationFixture('finance', 'finance note', financeUrl)]);
    area.seed(otherKey, [annotationFixture('other', 'other note', otherUrl)]);
    area.seed('unrelated-setting', { enabled: true });
    const storage = createAnnotationStorage(area, deterministicDependencies([]));

    expect((await storage.getSiteAnnotations(PAGE_URL)).map(({ id }) => id).sort()).toEqual([
      'finance',
      'news',
    ]);
  });

  test('clears every annotated page on one website and preserves other sites', async () => {
    const area = new InMemoryStorageArea();
    const financeUrl = 'https://www.yahoo.com/finance';
    const otherUrl = 'https://news.yahoo.com/story';
    area.seed(getRequiredKey(PAGE_URL), [annotationFixture('news', 'news note')]);
    area.seed(getRequiredKey(financeUrl), [annotationFixture('finance', 'finance note', financeUrl)]);
    area.seed(getRequiredKey(otherUrl), [annotationFixture('other', 'other note', otherUrl)]);
    const storage = createAnnotationStorage(area, deterministicDependencies([]));

    const result = await storage.execute({
      type: 'app-notes:annotation/clear-site',
      url: PAGE_URL,
    });

    expect(result).toEqual({ _tag: 'site-cleared', clearedPages: 2 });
    expect(await storage.getSiteAnnotations(PAGE_URL)).toEqual([]);
    expect((await storage.getAnnotations(otherUrl)).map(({ id }) => id)).toEqual(['other']);
  });

  test('continues queued work after a storage failure', async () => {
    const area = new InMemoryStorageArea();
    area.failNextSet();
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([100, 200]),
    );

    const [failed, succeeded] = await Promise.all([
      storage.execute(createCommand('fails')),
      storage.execute(createCommand('still runs')),
    ]);

    expect(failed).toEqual({
      _tag: 'failed',
      code: 'storage-error',
      message: 'Unable to persist annotations.',
    });
    expect(succeeded._tag).toBe('created');
    expect((await storage.getAnnotations(PAGE_URL)).map((annotation) => annotation.note)).toEqual([
      'still runs',
    ]);
  });

  test('rejects blank create and update commands', async () => {
    const area = new InMemoryStorageArea();
    const storage = createAnnotationStorage(
      area,
      deterministicDependencies([100]),
    );

    const created = await storage.execute(createCommand('   '));
    const updated = await storage.execute({
      type: 'app-notes:annotation/update-note',
      url: PAGE_URL,
      id: 'missing',
      note: '\n\t',
    });

    expect(created).toEqual({
      _tag: 'failed',
      code: 'invalid-command',
      message: 'Annotation note cannot be blank.',
    });
    expect(updated).toEqual({
      _tag: 'failed',
      code: 'invalid-command',
      message: 'Annotation note cannot be blank.',
    });
    expect(await storage.getAnnotations(PAGE_URL)).toEqual([]);
  });

  test('replays a create command without duplicating its annotation', async () => {
    const area = new InMemoryStorageArea();
    const storage = createAnnotationStorage(area, deterministicDependencies([100]));
    const command = createCommand('retry-safe');

    const first = await storage.execute(command);
    const replay = await storage.execute(command);

    expect(replay).toEqual(first);
    expect((await storage.getAnnotations(PAGE_URL)).map((annotation) => annotation.id)).toEqual([
      'annotation-retry-safe',
    ]);
  });
});

describe('annotation runtime client', () => {
  test('sends a typed command and parses the response', async () => {
    const annotation = annotationFixture('annotation-1', 'sent to background');
    const transport = new RecordingTransport({ _tag: 'created', annotation });
    const client = createAnnotationClient(transport);

    const result = await client.create(createPayload('sent to background'));

    expect(result).toEqual({ _tag: 'created', annotation });
    expect(transport.commands).toEqual([createCommand('sent to background')]);
  });

  test('turns an invalid background response into a typed failure', async () => {
    const transport = new RecordingTransport({ ok: true });
    const client = createAnnotationClient(transport);

    expect(await client.clear(PAGE_URL)).toEqual({
      _tag: 'failed',
      code: 'invalid-response',
      message: 'The annotation writer returned an invalid response.',
    });
  });

  test('sends the site-clear command through the typed client', async () => {
    const transport = new RecordingTransport({ _tag: 'site-cleared', clearedPages: 3 });
    const client = createAnnotationClient(transport);

    expect(await client.clearSite(PAGE_URL)).toEqual({ _tag: 'site-cleared', clearedPages: 3 });
    expect(transport.commands).toEqual([
      { type: 'app-notes:annotation/clear-site', url: PAGE_URL },
    ]);
  });
});

describe('site Markdown export', () => {
  test('groups notes by page with their canonical page URLs', async () => {
    const financeUrl = 'https://www.yahoo.com/finance?edition=us';
    const markdown = formatSiteAnnotationsMarkdown(PAGE_URL, [
      annotationFixture('finance', 'Check the ticker', financeUrl),
      annotationFixture('news', 'Tighten this card'),
    ]);

    expect(markdown).toContain('# Notes for www.yahoo.com');
    expect(markdown).toContain('2 notes across 2 pages');
    expect(markdown).toContain('## /finance');
    expect(markdown).toContain('https://www.yahoo.com/finance');
    expect(markdown).toContain('Check the ticker');
    expect(markdown).toContain('## /news');
    expect(markdown).toContain('Tighten this card');
  });
});

class InMemoryStorageArea implements AnnotationStorageArea {
  private readonly values = new Map<string, unknown>();
  private shouldFailNextSet = false;

  async get(key: string | string[] | null): Promise<Readonly<Record<string, unknown>>> {
    if (key === null) {
      return Object.fromEntries(
        [...this.values.entries()].map(([entryKey, value]) => [entryKey, structuredClone(value)]),
      );
    }
    const keys = typeof key === 'string' ? [key] : key;
    return Object.fromEntries(
      keys.map((entryKey) => [entryKey, structuredClone(this.values.get(entryKey))]),
    );
  }

  async set(items: Readonly<Record<string, unknown>>): Promise<void> {
    if (this.shouldFailNextSet) {
      this.shouldFailNextSet = false;
      throw new Error('Synthetic storage failure');
    }

    for (const [key, value] of Object.entries(items)) {
      this.values.set(key, structuredClone(value));
    }
  }

  async remove(key: string | string[]): Promise<void> {
    const keys = typeof key === 'string' ? [key] : key;
    for (const entryKey of keys) this.values.delete(entryKey);
  }

  seed(key: string, value: unknown): void {
    this.values.set(key, structuredClone(value));
  }

  failNextSet(): void {
    this.shouldFailNextSet = true;
  }
}

class RecordingTransport implements AnnotationRuntimeTransport {
  readonly commands: AnnotationMutationCommand[] = [];

  constructor(private readonly response: unknown) {}

  async sendMessage(command: AnnotationMutationCommand): Promise<unknown> {
    this.commands.push(command);
    return structuredClone(this.response);
  }
}

function deterministicDependencies(times: readonly number[]): AnnotationStorageDependencies {
  const remainingTimes = [...times];
  return {
    now: () => {
      const time = remainingTimes.shift();
      if (time === undefined) throw new Error('Missing deterministic time');
      return time;
    },
  };
}

function createPayload(note: string): AnnotationCreatePayload {
  return {
    id: `annotation-${note.replace(/\s+/g, '-')}`,
    url: PAGE_URL,
    type: 'comment',
    anchor: {
      selector: 'main > article',
      tagName: 'article',
      label: 'article "News"',
      attributes: [{ name: 'role', value: 'article' }],
      text: 'News card',
    },
    note,
    color: 'blue',
  };
}

function createCommand(note: string): AnnotationMutationCommand {
  return { type: 'app-notes:annotation/create', payload: createPayload(note) };
}

function annotationFixture(id: string, note: string, url = PAGE_URL): Annotation {
  return {
    id,
    url,
    createdAt: 100,
    updatedAt: 100,
    type: 'comment',
    anchor: {
      selector: 'main > article',
      tagName: 'article',
      label: 'article "News"',
      attributes: [{ name: 'role', value: 'article' }],
      text: 'News card',
    },
    note,
    color: 'blue',
  };
}

function getRequiredKey(url: string): string {
  const key = getAnnotationStorageKeyForUrl(url);
  if (key === null) throw new Error('Expected a supported test URL');
  return key;
}
