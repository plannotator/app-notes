import type { AnnotationScreenshotCapture } from './types';

/** A request from the active content script for a lossless visible-tab capture. */
export interface CaptureVisibleTabRequest {
  readonly type: 'app-notes:capture-visible-tab';
}

/** The raw visible-tab pixels returned across the runtime boundary. */
export type CaptureVisibleTabResult =
  | { readonly _tag: 'captured-tab'; readonly dataUrl: string }
  | { readonly _tag: 'capture-failed'; readonly message: string };

/** A cropped screenshot before its stable annotation identifier is assigned. */
export type ElementScreenshotDraft = Omit<AnnotationScreenshotCapture, 'id'>;

/** The observable result of capturing one selected visible element. */
export type ElementCaptureResult =
  | { readonly _tag: 'captured-element'; readonly screenshot: ElementScreenshotDraft }
  | { readonly _tag: 'capture-failed'; readonly message: string };

/** Parse the exact screenshot request handled by the background adapter. */
export function parseCaptureVisibleTabRequest(input: unknown): CaptureVisibleTabRequest | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const keys = Object.keys(input);
  return keys.length === 1 && Reflect.get(input, 'type') === 'app-notes:capture-visible-tab'
    ? { type: 'app-notes:capture-visible-tab' }
    : null;
}

/** Parse a screenshot response received from the background runtime. */
export function parseCaptureVisibleTabResult(input: unknown): CaptureVisibleTabResult | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const tag = Reflect.get(input, '_tag');
  if (tag === 'captured-tab') {
    const dataUrl = Reflect.get(input, 'dataUrl');
    return Object.keys(input).length === 2 && isPngDataUrl(dataUrl)
      ? { _tag: tag, dataUrl }
      : null;
  }
  if (tag === 'capture-failed') {
    const message = Reflect.get(input, 'message');
    return Object.keys(input).length === 2 && typeof message === 'string'
      ? { _tag: tag, message }
      : null;
  }
  return null;
}

/**
 * Hide App Notes, capture the active tab, and crop to the selected element's
 * visible viewport intersection without reconstructing the page DOM.
 */
export async function captureVisibleElement(
  rect: DOMRect,
  overlayHost: HTMLElement,
): Promise<ElementCaptureResult> {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const visibleRect = intersectRect(rect, viewportWidth, viewportHeight);
  if (visibleRect === null) {
    return { _tag: 'capture-failed', message: 'This element isn’t visible right now.' };
  }

  const previousVisibility = overlayHost.style.getPropertyValue('visibility');
  const previousPriority = overlayHost.style.getPropertyPriority('visibility');
  overlayHost.style.setProperty('visibility', 'hidden', 'important');

  let rawResult: CaptureVisibleTabResult | null = null;
  try {
    await waitForPaint();
    await waitForPaint();
    const response: unknown = await browser.runtime.sendMessage({
      type: 'app-notes:capture-visible-tab',
    } satisfies CaptureVisibleTabRequest);
    rawResult = parseCaptureVisibleTabResult(response);
  } catch {
    rawResult = null;
  } finally {
    if (previousVisibility) {
      overlayHost.style.setProperty('visibility', previousVisibility, previousPriority);
    } else {
      overlayHost.style.removeProperty('visibility');
    }
  }

  if (rawResult === null) {
    return { _tag: 'capture-failed', message: 'Couldn’t capture this element. Try again.' };
  }
  if (rawResult._tag === 'capture-failed') return rawResult;

  try {
    const image = await loadImage(rawResult.dataUrl);
    const crop = scaleCropRect(
      visibleRect,
      viewportWidth,
      viewportHeight,
      image.naturalWidth,
      image.naturalHeight,
    );
    const dataUrl = await cropPng(image, crop);
    return {
      _tag: 'captured-element',
      screenshot: {
        dataUrl,
        mimeType: 'image/png',
        width: crop.width,
        height: crop.height,
      },
    };
  } catch {
    return { _tag: 'capture-failed', message: 'Couldn’t prepare this screenshot. Try again.' };
  }
}

interface VisibleRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

interface PixelCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function intersectRect(rect: DOMRect, viewportWidth: number, viewportHeight: number): VisibleRect | null {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  return right > left && bottom > top ? { left, top, right, bottom } : null;
}

function scaleCropRect(
  rect: VisibleRect,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
): PixelCrop {
  const scaleX = imageWidth / viewportWidth;
  const scaleY = imageHeight / viewportHeight;
  const left = Math.max(0, Math.floor(rect.left * scaleX));
  const top = Math.max(0, Math.floor(rect.top * scaleY));
  const right = Math.min(imageWidth, Math.ceil(rect.right * scaleX));
  const bottom = Math.min(imageHeight, Math.ceil(rect.bottom * scaleY));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode captured tab image.'));
    image.src = dataUrl;
  });
}

function cropPng(image: HTMLImageElement, crop: PixelCrop): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const context = canvas.getContext('2d');
  if (context === null) return Promise.reject(new Error('Canvas is unavailable.'));
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('Unable to encode screenshot PNG.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string' && isPngDataUrl(result)) {
          resolve(result);
          return;
        }
        reject(new Error('Screenshot PNG encoding returned an invalid value.'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('Unable to read screenshot PNG.'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function isPngDataUrl(input: unknown): input is string {
  return typeof input === 'string' && input.startsWith('data:image/png;base64,');
}
