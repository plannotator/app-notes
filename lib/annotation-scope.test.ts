import { describe, expect, test } from 'bun:test';
import {
  annotationCollectionsEqual,
  collectionContainsStorageKey,
  getAnnotationCollectionIdentity,
  isLocalFileUrl,
  resolveAnnotationScope,
  resolveNavigatedAnnotationScope,
} from './annotation-scope';

describe('annotation collection scope', () => {
  test('keeps website collections site-wide even when page scope is requested', () => {
    const url = 'https://example.com/docs/getting-started';

    expect(resolveAnnotationScope(url)).toBe('site');
    expect(resolveAnnotationScope(url, 'page')).toBe('site');
    expect(getAnnotationCollectionIdentity(url, 'page')).toEqual({
      _tag: 'site',
      prefix: 'annotations:https://example.com/',
    });
  });

  test('defaults local collections to one file and permits explicit folder scope', () => {
    const url = 'file:///Users/ramos/workspaces/review/spec-kanban.html';

    expect(resolveAnnotationScope(url)).toBe('page');
    expect(getAnnotationCollectionIdentity(url)).toEqual({
      _tag: 'page',
      key: `annotations:${url}`,
    });
    expect(getAnnotationCollectionIdentity(url, 'site')).toEqual({
      _tag: 'site',
      prefix: 'annotations:file:///Users/ramos/workspaces/review/',
    });
  });

  test('matches storage changes by exact file or parent folder', () => {
    const kanbanUrl = 'file:///Users/ramos/workspaces/review/spec-kanban.html';
    const viewerUrl = 'file:///Users/ramos/workspaces/review/spec-artifact-viewer.html';
    const fileIdentity = getAnnotationCollectionIdentity(kanbanUrl, 'page');
    const folderIdentity = getAnnotationCollectionIdentity(kanbanUrl, 'site');
    if (fileIdentity === null || folderIdentity === null) {
      throw new Error('Expected supported local collection identities');
    }

    expect(collectionContainsStorageKey(fileIdentity, `annotations:${kanbanUrl}`)).toBe(true);
    expect(collectionContainsStorageKey(fileIdentity, `annotations:${viewerUrl}`)).toBe(false);
    expect(collectionContainsStorageKey(folderIdentity, `annotations:${viewerUrl}`)).toBe(true);
    expect(annotationCollectionsEqual(fileIdentity, folderIdentity)).toBe(false);
    expect(annotationCollectionsEqual(
      fileIdentity,
      getAnnotationCollectionIdentity(kanbanUrl, 'page'),
    )).toBe(true);
  });

  test('recognizes local files without treating malformed URLs as local', () => {
    expect(isLocalFileUrl('file:///tmp/review.html')).toBe(true);
    expect(isLocalFileUrl('https://example.com/review.html')).toBe(false);
    expect(isLocalFileUrl('not a url')).toBe(false);
  });

  test('retains an explicit folder scope only while navigating sibling files', () => {
    const kanbanUrl = 'file:///Users/ramos/workspaces/review/spec-kanban.html';
    const viewerUrl = 'file:///Users/ramos/workspaces/review/spec-artifact-viewer.html';
    const otherUrl = 'file:///Users/ramos/workspaces/other/spec.html';
    const current = { url: kanbanUrl, scope: 'site' as const };

    expect(resolveNavigatedAnnotationScope(viewerUrl, current)).toBe('site');
    expect(resolveNavigatedAnnotationScope(otherUrl, current)).toBe('page');
    expect(resolveNavigatedAnnotationScope(viewerUrl, current, 'page')).toBe('page');
  });
});
