import { strToU8, zipSync } from 'fflate';
import { formatSiteAnnotationsMarkdown } from './storage';
import type { Annotation } from './types';
import type { AnnotationScreenshotStore } from './screenshot-store';

/** A complete site export containing Markdown and every available screenshot PNG. */
export interface SiteExportArchive {
  readonly blob: Blob;
  readonly includedScreenshots: number;
  readonly missingScreenshots: number;
}

/** Build one ZIP without embedding binary screenshots into copied Markdown or note records. */
export async function createSiteExportArchive(
  url: string,
  annotations: ReadonlyArray<Annotation>,
  screenshots: AnnotationScreenshotStore,
): Promise<SiteExportArchive> {
  const screenshotAnnotations = [...annotations]
    .filter((annotation) => annotation.screenshot !== undefined)
    .sort((left, right) => {
      const urlOrder = left.url.localeCompare(right.url);
      if (urlOrder !== 0) return urlOrder;
      const timeOrder = left.createdAt - right.createdAt;
      return timeOrder !== 0 ? timeOrder : left.id.localeCompare(right.id);
    });
  const files: Record<string, Uint8Array> = {};
  const paths = new Map<string, string>();
  let missingScreenshots = 0;

  // Bound local reads because every PNG must remain in memory until the ZIP is assembled.
  const readConcurrency = 4;
  for (let offset = 0; offset < screenshotAnnotations.length; offset += readConcurrency) {
    const batch = screenshotAnnotations.slice(offset, offset + readConcurrency);
    await Promise.all(batch.map(async (annotation, batchIndex) => {
      const screenshot = annotation.screenshot;
      if (screenshot === undefined) return;
      const blob = await screenshots.get(screenshot.id);
      if (blob === null) {
        missingScreenshots += 1;
        return;
      }

      const path = createScreenshotPath(offset + batchIndex, annotation);
      paths.set(annotation.id, path);
      files[path] = new Uint8Array(await blob.arrayBuffer());
    }));
  }

  const markdown = formatSiteAnnotationsMarkdown(url, annotations, {
    screenshotPath: (annotation) => paths.get(annotation.id) ?? null,
  });
  files['notes.md'] = strToU8(markdown);
  const archive = zipSync(files, { level: 0 });
  return {
    blob: new Blob([archive], { type: 'application/zip' }),
    includedScreenshots: paths.size,
    missingScreenshots,
  };
}

function createScreenshotPath(index: number, annotation: Annotation): string {
  const source = annotation.anchor.text ?? annotation.anchor.label ?? 'element';
  const slug = source
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .toLowerCase() || 'element';
  return `screenshots/${String(index + 1).padStart(2, '0')}-${slug}.png`;
}
