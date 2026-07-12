import { describe, expect, test } from 'bun:test';
import { unzipSync } from 'fflate';
import { createSiteExportArchive } from './site-export';
import type { Annotation, AnnotationScreenshotCapture } from './types';
import type { AnnotationScreenshotStore } from './screenshot-store';

describe('site screenshot export', () => {
  test('packages Markdown and referenced PNGs in one archive', async () => {
    const annotation = screenshotAnnotation();
    const screenshots = new InMemoryScreenshotStore();
    await screenshots.save({
      ...annotation.screenshot,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
    });

    const result = await createSiteExportArchive(
      annotation.url,
      [annotation],
      screenshots,
    );
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const screenshotPath = Object.keys(files).find((path) => path.startsWith('screenshots/'));
    if (screenshotPath === undefined) throw new Error('Expected an exported screenshot');
    const notes = new TextDecoder().decode(files['notes.md']);

    expect(result.includedScreenshots).toBe(1);
    expect(result.missingScreenshots).toBe(0);
    expect(notes).toContain(`![Screenshot of Pricing card](<${screenshotPath}>)`);
    expect(new TextDecoder().decode(files[screenshotPath])).toBe(
      'data:image/png;base64,iVBORw0KGgo=',
    );
  });

  test('keeps the note usable when a screenshot blob is missing', async () => {
    const annotation = screenshotAnnotation();
    const result = await createSiteExportArchive(
      annotation.url,
      [annotation],
      new InMemoryScreenshotStore(),
    );
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const notes = new TextDecoder().decode(files['notes.md']);

    expect(result.includedScreenshots).toBe(0);
    expect(result.missingScreenshots).toBe(1);
    expect(notes).toContain('Screenshot attachment: 640 × 360 PNG');
    expect(Object.keys(files)).toEqual(['notes.md']);
  });
});

class InMemoryScreenshotStore implements AnnotationScreenshotStore {
  private readonly blobs = new Map<string, Blob>();

  async save(capture: AnnotationScreenshotCapture): Promise<void> {
    this.blobs.set(capture.id, new Blob([capture.dataUrl], { type: capture.mimeType }));
  }

  async get(id: string): Promise<Blob | null> {
    return this.blobs.get(id) ?? null;
  }

  async remove(ids: ReadonlyArray<string>): Promise<void> {
    for (const id of ids) this.blobs.delete(id);
  }
}

function screenshotAnnotation(): Annotation & { readonly screenshot: NonNullable<Annotation['screenshot']> } {
  return {
    id: 'annotation-pricing',
    url: 'https://example.com/pricing',
    createdAt: 100,
    updatedAt: 100,
    type: 'comment',
    anchor: {
      selector: '[data-testid="pricing"]',
      tagName: 'section',
      label: 'section pricing',
      text: 'Pricing card',
    },
    note: 'Tighten this section',
    color: 'blue',
    pageTitle: 'Pricing',
    screenshot: {
      id: 'annotation-pricing',
      mimeType: 'image/png',
      width: 640,
      height: 360,
    },
  };
}
