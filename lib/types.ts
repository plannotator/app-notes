import { parsePageId } from './page';

/** The supported visual behavior for an annotation. */
export type AnnotationType = 'comment' | 'highlight' | 'pin';

/** A viewport/document rectangle captured when an annotation is created. */
export interface AnnotationRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One stable element attribute captured as part of an anchor fingerprint. */
export interface AnnotationAnchorAttribute {
  readonly name: string;
  readonly value: string;
}

/** The persisted information used to find an annotation's target element. */
export interface AnnotationAnchor {
  readonly selector: string;
  readonly tagName: string;
  readonly label: string;
  readonly rect?: AnnotationRect;
  readonly attributes?: ReadonlyArray<AnnotationAnchorAttribute>;
  readonly text?: string;
  readonly nearbyText?: string;
}

/** Metadata for one lossless element screenshot attached to an annotation. */
export interface AnnotationScreenshot {
  readonly id: string;
  readonly mimeType: 'image/png';
  readonly width: number;
  readonly height: number;
}

/** A screenshot crossing the runtime boundary before its PNG is stored as a blob. */
export interface AnnotationScreenshotCapture extends AnnotationScreenshot {
  readonly dataUrl: string;
}

/** One persisted page annotation. */
export interface Annotation {
  readonly id: string;
  readonly url: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly type: AnnotationType;
  readonly anchor: AnnotationAnchor;
  readonly note: string;
  readonly color: string;
  /** The document title captured when the annotation was created. */
  readonly pageTitle?: string;
  /** Optional screenshot metadata; PNG bytes live in extension-owned blob storage. */
  readonly screenshot?: AnnotationScreenshot;
}

/** The exact caller-owned fields required to create an annotation. */
export interface AnnotationCreatePayload {
  readonly id: string;
  readonly url: string;
  readonly type: AnnotationType;
  readonly anchor: AnnotationAnchor;
  readonly note: string;
  readonly color: string;
  readonly pageTitle: string;
  readonly screenshot?: AnnotationScreenshotCapture;
}

/** The only mutable annotation field currently exposed by the product. */
export interface AnnotationNoteUpdate {
  readonly note: string;
}

/** A request to create an annotation. */
export interface CreateAnnotationCommand {
  readonly type: 'app-notes:annotation/create';
  readonly payload: AnnotationCreatePayload;
}

/** A request to update only an annotation's note. */
export interface UpdateAnnotationNoteCommand {
  readonly type: 'app-notes:annotation/update-note';
  readonly url: string;
  readonly id: string;
  readonly note: string;
}

/** A request to delete one annotation. */
export interface DeleteAnnotationCommand {
  readonly type: 'app-notes:annotation/delete';
  readonly url: string;
  readonly id: string;
}

/** A request to clear every annotation for one page. */
export interface ClearAnnotationsCommand {
  readonly type: 'app-notes:annotation/clear';
  readonly url: string;
}

/** A request to clear annotations from every page on one website. */
export interface ClearSiteAnnotationsCommand {
  readonly type: 'app-notes:annotation/clear-site';
  readonly url: string;
}

/** The complete mutation command protocol accepted by the background writer. */
export type AnnotationMutationCommand =
  | CreateAnnotationCommand
  | UpdateAnnotationNoteCommand
  | DeleteAnnotationCommand
  | ClearAnnotationsCommand
  | ClearSiteAnnotationsCommand;

/** Stable failure codes returned across the runtime message boundary. */
export type AnnotationMutationFailureCode =
  | 'invalid-command'
  | 'invalid-response'
  | 'storage-error'
  | 'transport-error';

/** A successful create result. */
export interface AnnotationCreatedResult {
  readonly _tag: 'created';
  readonly annotation: Annotation;
}

/** A successful note-update result, including ordinary not-found absence. */
export interface AnnotationUpdatedResult {
  readonly _tag: 'updated';
  readonly annotation: Annotation | null;
}

/** A successful delete result. */
export interface AnnotationDeletedResult {
  readonly _tag: 'deleted';
  readonly deleted: boolean;
}

/** A successful clear result. */
export interface AnnotationsClearedResult {
  readonly _tag: 'cleared';
}

/** A successful website clear result. */
export interface SiteAnnotationsClearedResult {
  readonly _tag: 'site-cleared';
  readonly clearedPages: number;
}

/** A serializable failure returned by the background mutation boundary. */
export interface AnnotationMutationFailedResult {
  readonly _tag: 'failed';
  readonly code: AnnotationMutationFailureCode;
  readonly message: string;
}

/** The complete serializable result protocol for annotation mutations. */
export type AnnotationMutationResult =
  | AnnotationCreatedResult
  | AnnotationUpdatedResult
  | AnnotationDeletedResult
  | AnnotationsClearedResult
  | SiteAnnotationsClearedResult
  | AnnotationMutationFailedResult;

/** The result returned to callers creating an annotation. */
export type CreateAnnotationResult = AnnotationCreatedResult | AnnotationMutationFailedResult;

/** The result returned to callers updating an annotation note. */
export type UpdateAnnotationNoteResult = AnnotationUpdatedResult | AnnotationMutationFailedResult;

/** The result returned to callers deleting an annotation. */
export type DeleteAnnotationResult = AnnotationDeletedResult | AnnotationMutationFailedResult;

/** The result returned to callers clearing a page's annotations. */
export type ClearAnnotationsResult = AnnotationsClearedResult | AnnotationMutationFailedResult;

/** The result returned to callers clearing a website's annotations. */
export type ClearSiteAnnotationsResult =
  | SiteAnnotationsClearedResult
  | AnnotationMutationFailedResult;

/** Parse one unknown persisted value into an Annotation. */
export function parseAnnotation(input: unknown): Annotation | null {
  if (!isRecord(input) || !hasAllowedAndRequiredKeys(
    input,
    ANNOTATION_ALLOWED_KEYS,
    ANNOTATION_REQUIRED_KEYS,
  )) return null;
  if (!isNonEmptyString(input.id) || !isSupportedUrl(input.url)) return null;
  if (!isFiniteNonNegativeNumber(input.createdAt)) return null;
  if (!isFiniteNonNegativeNumber(input.updatedAt) || input.updatedAt < input.createdAt) return null;
  if (!isAnnotationType(input.type)) return null;
  if (typeof input.note !== 'string' || !isNonEmptyString(input.color)) return null;

  const anchor = parseAnnotationAnchor(input.anchor);
  if (anchor === null) return null;

  let pageTitle: string | undefined;
  if (Object.hasOwn(input, 'pageTitle')) {
    if (!isBoundedNonBlankString(input.pageTitle, PAGE_TITLE_MAX_LENGTH)) return null;
    pageTitle = input.pageTitle;
  }

  let screenshot: AnnotationScreenshot | undefined;
  if (Object.hasOwn(input, 'screenshot')) {
    const parsedScreenshot = parseAnnotationScreenshot(input.screenshot);
    if (parsedScreenshot === null || parsedScreenshot.id !== input.id) return null;
    screenshot = parsedScreenshot;
  }

  return {
    id: input.id,
    url: input.url,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    type: input.type,
    anchor,
    note: input.note,
    color: input.color,
    ...(pageTitle !== undefined ? { pageTitle } : {}),
    ...(screenshot !== undefined ? { screenshot } : {}),
  };
}

/** Parse a persisted collection, filtering malformed rows without trusting storage. */
export function parseAnnotations(input: unknown): Annotation[] {
  if (!Array.isArray(input)) return [];

  const annotations: Annotation[] = [];
  for (const item of input) {
    const annotation = parseAnnotation(item);
    if (annotation !== null) annotations.push(annotation);
  }
  return annotations;
}

/** Parse unknown input into the exact create payload accepted by the domain. */
export function parseAnnotationCreatePayload(input: unknown): AnnotationCreatePayload | null {
  if (!isRecord(input) || !hasAllowedAndRequiredKeys(
    input,
    CREATE_PAYLOAD_ALLOWED_KEYS,
    CREATE_PAYLOAD_REQUIRED_KEYS,
  )) return null;
  if (!isNonEmptyString(input.id) || !isSupportedUrl(input.url) || !isAnnotationType(input.type)) {
    return null;
  }
  if (!isNonBlankString(input.note) || !isNonEmptyString(input.color)) return null;
  if (!isBoundedNonBlankString(input.pageTitle, PAGE_TITLE_MAX_LENGTH)) return null;

  const anchor = parseAnnotationAnchor(input.anchor);
  if (anchor === null) return null;

  let screenshot: AnnotationScreenshotCapture | undefined;
  if (Object.hasOwn(input, 'screenshot')) {
    const parsedScreenshot = parseAnnotationScreenshotCapture(input.screenshot);
    if (parsedScreenshot === null || parsedScreenshot.id !== input.id) return null;
    screenshot = parsedScreenshot;
  }

  return {
    id: input.id,
    url: input.url,
    type: input.type,
    anchor,
    note: input.note,
    color: input.color,
    pageTitle: input.pageTitle,
    ...(screenshot !== undefined ? { screenshot } : {}),
  };
}

/** Parse an unknown runtime message into an annotation mutation command. */
export function parseAnnotationMutationCommand(input: unknown): AnnotationMutationCommand | null {
  if (!isRecord(input) || typeof input.type !== 'string') return null;

  switch (input.type) {
    case 'app-notes:annotation/create': {
      if (!hasExactKeys(input, CREATE_COMMAND_KEYS)) return null;
      const payload = parseAnnotationCreatePayload(input.payload);
      return payload === null ? null : { type: input.type, payload };
    }
    case 'app-notes:annotation/update-note':
      if (!hasExactKeys(input, UPDATE_COMMAND_KEYS)) return null;
      if (!isSupportedUrl(input.url) || !isNonEmptyString(input.id)) return null;
      return isNonBlankString(input.note)
        ? { type: input.type, url: input.url, id: input.id, note: input.note }
        : null;
    case 'app-notes:annotation/delete':
      if (!hasExactKeys(input, DELETE_COMMAND_KEYS)) return null;
      return isSupportedUrl(input.url) && isNonEmptyString(input.id)
        ? { type: input.type, url: input.url, id: input.id }
        : null;
    case 'app-notes:annotation/clear':
      if (!hasExactKeys(input, CLEAR_COMMAND_KEYS)) return null;
      return isSupportedUrl(input.url) ? { type: input.type, url: input.url } : null;
    case 'app-notes:annotation/clear-site':
      if (!hasExactKeys(input, CLEAR_COMMAND_KEYS)) return null;
      return isSupportedUrl(input.url) ? { type: input.type, url: input.url } : null;
    default:
      return null;
  }
}

/** Parse an unknown runtime response into the annotation mutation result protocol. */
export function parseAnnotationMutationResult(input: unknown): AnnotationMutationResult | null {
  if (!isRecord(input) || typeof input._tag !== 'string') return null;

  switch (input._tag) {
    case 'created': {
      if (!hasExactKeys(input, CREATED_RESULT_KEYS)) return null;
      const annotation = parseAnnotation(input.annotation);
      return annotation === null ? null : { _tag: input._tag, annotation };
    }
    case 'updated': {
      if (!hasExactKeys(input, UPDATED_RESULT_KEYS)) return null;
      if (input.annotation === null) return { _tag: input._tag, annotation: null };
      const annotation = parseAnnotation(input.annotation);
      return annotation === null ? null : { _tag: input._tag, annotation };
    }
    case 'deleted':
      if (!hasExactKeys(input, DELETED_RESULT_KEYS) || typeof input.deleted !== 'boolean') return null;
      return { _tag: input._tag, deleted: input.deleted };
    case 'cleared':
      return hasExactKeys(input, CLEARED_RESULT_KEYS) ? { _tag: input._tag } : null;
    case 'site-cleared':
      if (!hasExactKeys(input, SITE_CLEARED_RESULT_KEYS)) return null;
      return Number.isSafeInteger(input.clearedPages) && Number(input.clearedPages) >= 0
        ? { _tag: input._tag, clearedPages: Number(input.clearedPages) }
        : null;
    case 'failed':
      if (!hasExactKeys(input, FAILED_RESULT_KEYS)) return null;
      if (!isMutationFailureCode(input.code) || typeof input.message !== 'string') return null;
      return { _tag: input._tag, code: input.code, message: input.message };
    default:
      return null;
  }
}

const PAGE_TITLE_MAX_LENGTH = 160;
const ELEMENT_TEXT_MAX_LENGTH = 180;
const NEARBY_TEXT_MAX_LENGTH = 280;
const SCREENSHOT_DATA_URL_MAX_LENGTH = 32 * 1024 * 1024;
const ANNOTATION_REQUIRED_KEYS = [
  'id',
  'url',
  'createdAt',
  'updatedAt',
  'type',
  'anchor',
  'note',
  'color',
] as const;
const ANNOTATION_ALLOWED_KEYS = [
  ...ANNOTATION_REQUIRED_KEYS,
  'pageTitle',
  'screenshot',
] as const;
const ANCHOR_REQUIRED_KEYS = ['selector', 'tagName', 'label'] as const;
const ANCHOR_ALLOWED_KEYS = [
  ...ANCHOR_REQUIRED_KEYS,
  'rect',
  'attributes',
  'text',
  'nearbyText',
] as const;
const ANCHOR_ATTRIBUTE_KEYS = ['name', 'value'] as const;
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const;
const CREATE_PAYLOAD_REQUIRED_KEYS = [
  'id',
  'url',
  'type',
  'anchor',
  'note',
  'color',
  'pageTitle',
] as const;
const CREATE_PAYLOAD_ALLOWED_KEYS = [...CREATE_PAYLOAD_REQUIRED_KEYS, 'screenshot'] as const;
const SCREENSHOT_KEYS = ['id', 'mimeType', 'width', 'height'] as const;
const SCREENSHOT_CAPTURE_KEYS = [...SCREENSHOT_KEYS, 'dataUrl'] as const;
const CREATE_COMMAND_KEYS = ['type', 'payload'] as const;
const UPDATE_COMMAND_KEYS = ['type', 'url', 'id', 'note'] as const;
const DELETE_COMMAND_KEYS = ['type', 'url', 'id'] as const;
const CLEAR_COMMAND_KEYS = ['type', 'url'] as const;
const CREATED_RESULT_KEYS = ['_tag', 'annotation'] as const;
const UPDATED_RESULT_KEYS = ['_tag', 'annotation'] as const;
const DELETED_RESULT_KEYS = ['_tag', 'deleted'] as const;
const CLEARED_RESULT_KEYS = ['_tag'] as const;
const SITE_CLEARED_RESULT_KEYS = ['_tag', 'clearedPages'] as const;
const FAILED_RESULT_KEYS = ['_tag', 'code', 'message'] as const;

function parseAnnotationScreenshot(input: unknown): AnnotationScreenshot | null {
  if (!isRecord(input) || !hasExactKeys(input, SCREENSHOT_KEYS)) return null;
  if (!isNonEmptyString(input.id) || input.mimeType !== 'image/png') return null;
  if (!isSafePositiveInteger(input.width) || !isSafePositiveInteger(input.height)) return null;

  return {
    id: input.id,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
  };
}

function parseAnnotationScreenshotCapture(
  input: unknown,
): AnnotationScreenshotCapture | null {
  if (!isRecord(input) || !hasExactKeys(input, SCREENSHOT_CAPTURE_KEYS)) return null;
  const screenshot = parseAnnotationScreenshot({
    id: input.id,
    mimeType: input.mimeType,
    width: input.width,
    height: input.height,
  });
  if (screenshot === null || !isPngDataUrl(input.dataUrl)) return null;
  return { ...screenshot, dataUrl: input.dataUrl };
}

function parseAnnotationAnchor(input: unknown): AnnotationAnchor | null {
  if (!isRecord(input) || !hasAllowedAndRequiredKeys(input, ANCHOR_ALLOWED_KEYS, ANCHOR_REQUIRED_KEYS)) {
    return null;
  }
  if (!isNonEmptyString(input.selector) || !isNonEmptyString(input.tagName)) return null;
  if (typeof input.label !== 'string') return null;

  let rect: AnnotationRect | undefined;
  if (Object.hasOwn(input, 'rect')) {
    const parsedRect = parseAnnotationRect(input.rect);
    if (parsedRect === null) return null;
    rect = parsedRect;
  }

  let attributes: ReadonlyArray<AnnotationAnchorAttribute> | undefined;
  if (Object.hasOwn(input, 'attributes')) {
    const parsedAttributes = parseAnnotationAnchorAttributes(input.attributes);
    if (parsedAttributes === null) return null;
    attributes = parsedAttributes;
  }

  let text: string | undefined;
  if (Object.hasOwn(input, 'text')) {
    if (!isBoundedNonBlankString(input.text, ELEMENT_TEXT_MAX_LENGTH)) return null;
    text = input.text;
  }

  let nearbyText: string | undefined;
  if (Object.hasOwn(input, 'nearbyText')) {
    if (!isBoundedNonBlankString(input.nearbyText, NEARBY_TEXT_MAX_LENGTH)) return null;
    nearbyText = input.nearbyText;
  }

  const base = { selector: input.selector, tagName: input.tagName, label: input.label };
  return {
    ...base,
    ...(rect !== undefined ? { rect } : {}),
    ...(attributes !== undefined ? { attributes } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(nearbyText !== undefined ? { nearbyText } : {}),
  };
}

function parseAnnotationAnchorAttributes(
  input: unknown,
): ReadonlyArray<AnnotationAnchorAttribute> | null {
  if (!Array.isArray(input)) return null;

  const attributes: AnnotationAnchorAttribute[] = [];
  for (const item of input) {
    if (!isRecord(item) || !hasExactKeys(item, ANCHOR_ATTRIBUTE_KEYS)) return null;
    if (!isNonEmptyString(item.name) || typeof item.value !== 'string') return null;
    attributes.push({ name: item.name, value: item.value });
  }
  return attributes;
}

function parseAnnotationRect(input: unknown): AnnotationRect | null {
  if (!isRecord(input) || !hasExactKeys(input, RECT_KEYS)) return null;
  if (!isFiniteNumber(input.x) || !isFiniteNumber(input.y)) return null;
  if (!isFiniteNonNegativeNumber(input.width) || !isFiniteNonNegativeNumber(input.height)) return null;
  return { x: input.x, y: input.y, width: input.width, height: input.height };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function hasExactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  return hasAllowedAndRequiredKeys(input, keys, keys);
}

function hasAllowedAndRequiredKeys(
  input: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
): boolean {
  const inputKeys = Object.keys(input);
  return (
    inputKeys.every((key) => allowedKeys.includes(key)) &&
    requiredKeys.every((key) => Object.hasOwn(input, key))
  );
}

function isSupportedUrl(input: unknown): input is string {
  return typeof input === 'string' && parsePageId(input) !== null;
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.length > 0;
}

function isNonBlankString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

function isBoundedNonBlankString(input: unknown, maximumLength: number): input is string {
  return isNonBlankString(input) && input.length <= maximumLength;
}

function isFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input);
}

function isFiniteNonNegativeNumber(input: unknown): input is number {
  return isFiniteNumber(input) && input >= 0;
}

function isSafePositiveInteger(input: unknown): input is number {
  return typeof input === 'number' && Number.isSafeInteger(input) && input > 0;
}

function isPngDataUrl(input: unknown): input is string {
  if (typeof input !== 'string' || input.length > SCREENSHOT_DATA_URL_MAX_LENGTH) return false;
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input);
}

function isAnnotationType(input: unknown): input is AnnotationType {
  return input === 'comment' || input === 'highlight' || input === 'pin';
}

function isMutationFailureCode(input: unknown): input is AnnotationMutationFailureCode {
  return (
    input === 'invalid-command' ||
    input === 'invalid-response' ||
    input === 'storage-error' ||
    input === 'transport-error'
  );
}
