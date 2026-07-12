import { describe, expect, test } from 'bun:test';
import {
  parseAnnotation,
  parseAnnotationMutationCommand,
  parseAnnotationMutationResult,
} from './types';
import type { Annotation, AnnotationMutationCommand } from './types';

const validAnnotation: Annotation = {
  id: 'annotation-1',
  url: 'https://www.yahoo.com/news',
  createdAt: 100,
  updatedAt: 100,
  type: 'comment',
  anchor: {
    selector: 'main > article',
    tagName: 'article',
    label: 'article "News"',
    rect: { x: 10, y: 20, width: 300, height: 200 },
    attributes: [
      { name: 'role', value: 'article' },
      { name: 'aria-label', value: 'News' },
    ],
    text: 'Durable nearby text',
  },
  note: 'Review this story card',
  color: 'blue',
};

describe('annotation boundary parsing', () => {
  test('parses durable anchor fingerprints', () => {
    expect(parseAnnotation(validAnnotation)).toEqual(validAnnotation);
  });

  test('preserves legacy anchors without fingerprint fields', () => {
    const legacy: Annotation = {
      ...validAnnotation,
      anchor: {
        selector: '#legacy',
        tagName: 'div',
        label: 'div legacy',
      },
    };

    expect(parseAnnotation(legacy)).toEqual(legacy);
  });

  test('accepts local-file annotations at the persistence boundary', () => {
    const local: Annotation = {
      ...validAnnotation,
      url: 'file:///Users/ramos/workspaces/guided-review/index.html',
    };

    expect(parseAnnotation(local)).toEqual(local);
  });

  test('parses bounded page and nearby element context', () => {
    const enriched: Annotation = {
      ...validAnnotation,
      pageTitle: 'Hacker News',
      anchor: {
        ...validAnnotation.anchor,
        text: 'We scaled PgBouncer to 4x throughput',
        nearbyText: '8. We scaled PgBouncer to 4x throughput (clickhouse.com)',
      },
    };

    expect(parseAnnotation(enriched)).toEqual(enriched);
    expect(parseAnnotation({ ...enriched, pageTitle: 'x'.repeat(161) })).toBeNull();
    expect(
      parseAnnotation({
        ...enriched,
        anchor: { ...enriched.anchor, nearbyText: 'x'.repeat(281) },
      }),
    ).toBeNull();
  });

  test('parses screenshot metadata without accepting PNG bytes in persisted notes', () => {
    const withScreenshot: Annotation = {
      ...validAnnotation,
      screenshot: {
        id: validAnnotation.id,
        mimeType: 'image/png',
        width: 640,
        height: 360,
      },
    };

    expect(parseAnnotation(withScreenshot)).toEqual(withScreenshot);
    expect(parseAnnotation({
      ...withScreenshot,
      screenshot: { ...withScreenshot.screenshot, id: 'another-annotation' },
    })).toBeNull();
    expect(parseAnnotation({
      ...withScreenshot,
      screenshot: { ...withScreenshot.screenshot, dataUrl: 'data:image/png;base64,AAAA' },
    })).toBeNull();
  });

  test('strictly parses mutation commands', () => {
    const command: AnnotationMutationCommand = {
      type: 'app-notes:annotation/create',
      payload: {
        id: validAnnotation.id,
        url: validAnnotation.url,
        type: validAnnotation.type,
        anchor: validAnnotation.anchor,
        note: validAnnotation.note,
        color: validAnnotation.color,
        pageTitle: 'Yahoo News',
      },
    };

    expect(parseAnnotationMutationCommand(command)).toEqual(command);
    expect(parseAnnotationMutationCommand({
      ...command,
      payload: {
        ...command.payload,
        screenshot: {
          id: command.payload.id,
          mimeType: 'image/png',
          width: 320,
          height: 180,
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
      },
    })).toEqual({
      ...command,
      payload: {
        ...command.payload,
        screenshot: {
          id: command.payload.id,
          mimeType: 'image/png',
          width: 320,
          height: 180,
          dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        },
      },
    });
    expect(parseAnnotationMutationCommand({ ...command, unexpected: true })).toBeNull();
    expect(
      parseAnnotationMutationCommand({
        type: 'app-notes:annotation/clear-site',
        url: validAnnotation.url,
      }),
    ).toEqual({ type: 'app-notes:annotation/clear-site', url: validAnnotation.url });
  });

  test('rejects malformed mutation results', () => {
    expect(
      parseAnnotationMutationResult({ _tag: 'created', annotation: validAnnotation }),
    ).toEqual({ _tag: 'created', annotation: validAnnotation });
    expect(
      parseAnnotationMutationResult({
        _tag: 'created',
        annotation: { ...validAnnotation, createdAt: 'yesterday' },
      }),
    ).toBeNull();
    expect(parseAnnotationMutationResult({ _tag: 'site-cleared', clearedPages: 2 })).toEqual({
      _tag: 'site-cleared',
      clearedPages: 2,
    });
    expect(parseAnnotationMutationResult({ _tag: 'site-cleared', clearedPages: -1 })).toBeNull();
  });
});
