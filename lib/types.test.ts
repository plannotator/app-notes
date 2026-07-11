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
      },
    };

    expect(parseAnnotationMutationCommand(command)).toEqual(command);
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
