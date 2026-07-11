import {
  getAnnotationStorageKeyForUrl,
  getAnnotationStoragePrefixForUrl,
  parsePageId,
} from './page';
import {
  parseAnnotationMutationResult,
  parseAnnotations,
} from './types';
import type {
  Annotation,
  AnnotationCreatePayload,
  AnnotationMutationCommand,
  AnnotationMutationFailedResult,
  AnnotationMutationResult,
  AnnotationNoteUpdate,
  ClearAnnotationsResult,
  ClearSiteAnnotationsResult,
  CreateAnnotationResult,
  DeleteAnnotationResult,
  UpdateAnnotationNoteResult,
} from './types';

/** The subset of browser storage used by the annotation repository. */
export interface AnnotationStorageArea {
  readonly get: (key: string | string[] | null) => Promise<Readonly<Record<string, unknown>>>;
  readonly set: (items: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly remove: (key: string | string[]) => Promise<void>;
}

/** Deterministic dependencies owned by the background composition root. */
export interface AnnotationStorageDependencies {
  readonly now: () => number;
}

/** A serialized, background-owned annotation storage service. */
export interface AnnotationStorage {
  /** Read and parse all valid annotations for a page. */
  readonly getAnnotations: (url: string) => Promise<Annotation[]>;
  /** Read and parse annotations from every page on a website. */
  readonly getSiteAnnotations: (url: string) => Promise<Annotation[]>;
  /** Execute one mutation after all earlier mutations on this instance settle. */
  readonly execute: (command: AnnotationMutationCommand) => Promise<AnnotationMutationResult>;
}

/** The runtime-message capability used by extension-page mutation clients. */
export interface AnnotationRuntimeTransport {
  readonly sendMessage: (command: AnnotationMutationCommand) => Promise<unknown>;
}

/** Typed client operations that send every mutation to the background writer. */
export interface AnnotationClient {
  readonly create: (payload: AnnotationCreatePayload) => Promise<CreateAnnotationResult>;
  readonly updateNote: (
    url: string,
    id: string,
    update: AnnotationNoteUpdate,
  ) => Promise<UpdateAnnotationNoteResult>;
  readonly delete: (url: string, id: string) => Promise<DeleteAnnotationResult>;
  readonly clear: (url: string) => Promise<ClearAnnotationsResult>;
  readonly clearSite: (url: string) => Promise<ClearSiteAnnotationsResult>;
}

/**
 * Create the sole annotation writer for a background-service-worker instance.
 *
 * Mutations share a rejection-safe queue. This makes the existing array-per-page
 * representation linearizable as long as all mutation clients use the runtime
 * command protocol and the background owns one service instance.
 */
export function createAnnotationStorage(
  area: AnnotationStorageArea,
  dependencies: AnnotationStorageDependencies,
): AnnotationStorage {
  let mutationTail: Promise<void> = Promise.resolve();

  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationTail.then(operation, operation);
    mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const execute = (command: AnnotationMutationCommand): Promise<AnnotationMutationResult> =>
    enqueue(async () => {
      try {
        switch (command.type) {
          case 'app-notes:annotation/create':
            return await createAnnotation(area, dependencies, command.payload);
          case 'app-notes:annotation/update-note':
            return await updateAnnotationNote(
              area,
              dependencies,
              command.url,
              command.id,
              command.note,
            );
          case 'app-notes:annotation/delete':
            return await removeAnnotation(area, command.url, command.id);
          case 'app-notes:annotation/clear':
            return await removePageAnnotations(area, command.url);
          case 'app-notes:annotation/clear-site':
            return await removeSiteAnnotations(area, command.url);
          default:
            return casesHandled(command);
        }
      } catch {
        return mutationFailure('storage-error', 'Unable to persist annotations.');
      }
    });

  return {
    getAnnotations: (url) => readAnnotations(area, url),
    getSiteAnnotations: (url) => readSiteAnnotations(area, url),
    execute,
  };
}

/** Create a typed mutation client over a runtime message transport. */
export function createAnnotationClient(transport: AnnotationRuntimeTransport): AnnotationClient {
  return {
    create: async (payload) => {
      const result = await sendMutation(transport, {
        type: 'app-notes:annotation/create',
        payload,
      });
      return result._tag === 'created' || result._tag === 'failed'
        ? result
        : invalidResponse();
    },
    updateNote: async (url, id, update) => {
      const result = await sendMutation(transport, {
        type: 'app-notes:annotation/update-note',
        url,
        id,
        note: update.note,
      });
      return result._tag === 'updated' || result._tag === 'failed'
        ? result
        : invalidResponse();
    },
    delete: async (url, id) => {
      const result = await sendMutation(transport, {
        type: 'app-notes:annotation/delete',
        url,
        id,
      });
      return result._tag === 'deleted' || result._tag === 'failed'
        ? result
        : invalidResponse();
    },
    clear: async (url) => {
      const result = await sendMutation(transport, {
        type: 'app-notes:annotation/clear',
        url,
      });
      return result._tag === 'cleared' || result._tag === 'failed'
        ? result
        : invalidResponse();
    },
    clearSite: async (url) => {
      const result = await sendMutation(transport, {
        type: 'app-notes:annotation/clear-site',
        url,
      });
      return result._tag === 'site-cleared' || result._tag === 'failed'
        ? result
        : invalidResponse();
    },
  };
}

/** Read annotations directly from local storage; only mutations require the background writer. */
export async function getAnnotations(url: string): Promise<Annotation[]> {
  return readAnnotations(browser.storage.local, url);
}

/** Read every parsed annotation stored for the URL's website. */
export async function getSiteAnnotations(url: string): Promise<Annotation[]> {
  return readSiteAnnotations(browser.storage.local, url);
}

/** Send a create command to the background annotation writer. */
export async function saveAnnotation(
  payload: AnnotationCreatePayload,
): Promise<CreateAnnotationResult> {
  return browserAnnotationClient.create(payload);
}

/** Send a note-only update command to the background annotation writer. */
export async function updateAnnotation(
  url: string,
  id: string,
  update: AnnotationNoteUpdate,
): Promise<UpdateAnnotationNoteResult> {
  return browserAnnotationClient.updateNote(url, id, update);
}

/** Send a delete command to the background annotation writer. */
export async function deleteAnnotation(
  url: string,
  id: string,
): Promise<DeleteAnnotationResult> {
  return browserAnnotationClient.delete(url, id);
}

/** Send a page-clear command to the background annotation writer. */
export async function clearAnnotations(url: string): Promise<ClearAnnotationsResult> {
  return browserAnnotationClient.clear(url);
}

/** Send a website-clear command to the background annotation writer. */
export async function clearSiteAnnotations(url: string): Promise<ClearSiteAnnotationsResult> {
  return browserAnnotationClient.clearSite(url);
}

/** Render the current page's parsed annotations as Markdown. */
export async function exportAnnotations(url: string): Promise<string> {
  const annotations = await getAnnotations(url);
  if (annotations.length === 0) return '# No annotations\n';

  let markdown = `# Annotations for ${url}\n\n`;
  for (const annotation of annotations) {
    const time = new Date(annotation.createdAt).toLocaleString();
    const icon =
      annotation.type === 'comment' ? '💬' : annotation.type === 'highlight' ? '🖍️' : '📌';
    markdown += `## ${icon} ${annotation.anchor.label}\n`;
    markdown += `\`${annotation.anchor.selector}\`\n\n`;
    if (annotation.note) markdown += `${annotation.note}\n\n`;
    markdown += `_${time}_\n\n---\n\n`;
  }
  return markdown;
}

/** Render every annotation on the URL's website as page-grouped Markdown. */
export async function exportSiteAnnotations(url: string): Promise<string> {
  const annotations = await getSiteAnnotations(url);
  return formatSiteAnnotationsMarkdown(url, annotations);
}

/** Format already-parsed website annotations as deterministic, page-grouped Markdown. */
export function formatSiteAnnotationsMarkdown(
  url: string,
  annotations: ReadonlyArray<Annotation>,
): string {
  const site = getSiteLabel(url);
  if (annotations.length === 0) return `# No annotations for ${site}\n`;

  const groups = groupAnnotationsByPage(annotations);
  let markdown = `# Notes for ${site}\n\n`;
  markdown += `${annotations.length} ${annotations.length === 1 ? 'note' : 'notes'} across `;
  markdown += `${groups.length} ${groups.length === 1 ? 'page' : 'pages'}\n\n`;

  for (const group of groups) {
    markdown += `## ${getPageLabel(group.pageId)}\n\n`;
    markdown += `${group.pageId}\n\n`;
    for (const annotation of group.annotations) {
      const time = new Date(annotation.createdAt).toLocaleString();
      markdown += `### ${annotation.anchor.label}\n\n`;
      markdown += `\`${annotation.anchor.selector}\`\n\n`;
      if (annotation.note) markdown += `${annotation.note}\n\n`;
      markdown += `_Created ${time}_\n\n`;
    }
  }

  return markdown;
}

const browserAnnotationClient = createAnnotationClient({
  sendMessage: async (command) => {
    const response: unknown = await browser.runtime.sendMessage(command);
    return response;
  },
});

async function readAnnotations(area: AnnotationStorageArea, url: string): Promise<Annotation[]> {
  const key = getAnnotationStorageKeyForUrl(url);
  if (key === null) return [];

  const result = await area.get(key);
  return parseAnnotations(result[key]).filter(
    (annotation) => getAnnotationStorageKeyForUrl(annotation.url) === key,
  );
}

async function readSiteAnnotations(
  area: AnnotationStorageArea,
  url: string,
): Promise<Annotation[]> {
  const prefix = getAnnotationStoragePrefixForUrl(url);
  if (prefix === null) return [];

  const result = await area.get(null);
  const annotations: Annotation[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (!key.startsWith(prefix)) continue;
    annotations.push(
      ...parseAnnotations(value).filter(
        (annotation) => getAnnotationStorageKeyForUrl(annotation.url) === key,
      ),
    );
  }
  return annotations;
}

async function createAnnotation(
  area: AnnotationStorageArea,
  dependencies: AnnotationStorageDependencies,
  payload: AnnotationCreatePayload,
): Promise<AnnotationMutationResult> {
  const key = getAnnotationStorageKeyForUrl(payload.url);
  if (key === null) return mutationFailure('invalid-command', 'Annotation URL is unsupported.');
  if (payload.note.trim().length === 0) {
    return mutationFailure('invalid-command', 'Annotation note cannot be blank.');
  }

  const existing = await readAnnotations(area, payload.url);
  const replay = existing.find((annotation) => annotation.id === payload.id);
  if (replay !== undefined) return { _tag: 'created', annotation: replay };

  const now = dependencies.now();
  const annotation: Annotation = {
    id: payload.id,
    url: payload.url,
    createdAt: now,
    updatedAt: now,
    type: payload.type,
    anchor: payload.anchor,
    note: payload.note,
    color: payload.color,
  };

  await area.set({ [key]: [...existing, annotation] });
  return { _tag: 'created', annotation };
}

async function updateAnnotationNote(
  area: AnnotationStorageArea,
  dependencies: AnnotationStorageDependencies,
  url: string,
  id: string,
  note: string,
): Promise<AnnotationMutationResult> {
  const key = getAnnotationStorageKeyForUrl(url);
  if (key === null) return mutationFailure('invalid-command', 'Annotation URL is unsupported.');
  if (note.trim().length === 0) {
    return mutationFailure('invalid-command', 'Annotation note cannot be blank.');
  }

  const annotations = await readAnnotations(area, url);
  const current = annotations.find((annotation) => annotation.id === id);
  if (current === undefined) return { _tag: 'updated', annotation: null };

  const updated: Annotation = { ...current, note, updatedAt: dependencies.now() };
  const next = annotations.map((annotation) => (annotation.id === id ? updated : annotation));
  await area.set({ [key]: next });
  return { _tag: 'updated', annotation: updated };
}

async function removeAnnotation(
  area: AnnotationStorageArea,
  url: string,
  id: string,
): Promise<AnnotationMutationResult> {
  const key = getAnnotationStorageKeyForUrl(url);
  if (key === null) return mutationFailure('invalid-command', 'Annotation URL is unsupported.');

  const annotations = await readAnnotations(area, url);
  const next = annotations.filter((annotation) => annotation.id !== id);
  if (next.length === annotations.length) return { _tag: 'deleted', deleted: false };

  await area.set({ [key]: next });
  return { _tag: 'deleted', deleted: true };
}

async function removePageAnnotations(
  area: AnnotationStorageArea,
  url: string,
): Promise<AnnotationMutationResult> {
  const key = getAnnotationStorageKeyForUrl(url);
  if (key === null) return mutationFailure('invalid-command', 'Annotation URL is unsupported.');

  await area.remove(key);
  return { _tag: 'cleared' };
}

async function removeSiteAnnotations(
  area: AnnotationStorageArea,
  url: string,
): Promise<AnnotationMutationResult> {
  const prefix = getAnnotationStoragePrefixForUrl(url);
  if (prefix === null) return mutationFailure('invalid-command', 'Annotation URL is unsupported.');

  const result = await area.get(null);
  const keys = Object.keys(result).filter((key) => key.startsWith(prefix));
  if (keys.length > 0) await area.remove(keys);
  return { _tag: 'site-cleared', clearedPages: keys.length };
}

export interface AnnotationPageGroup {
  readonly pageId: string;
  readonly annotations: ReadonlyArray<Annotation>;
}

/** Group parsed annotations by their canonical origin-and-path page identity. */
export function groupAnnotationsByPage(
  annotations: ReadonlyArray<Annotation>,
): ReadonlyArray<AnnotationPageGroup> {
  const groups = new Map<string, Annotation[]>();
  for (const annotation of annotations) {
    const pageId = parsePageId(annotation.url);
    if (pageId === null) continue;
    const group = groups.get(pageId) ?? [];
    group.push(annotation);
    groups.set(pageId, group);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([pageId, pageAnnotations]) => ({
      pageId,
      annotations: [...pageAnnotations].sort((left, right) => left.createdAt - right.createdAt),
    }));
}

function getSiteLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'this site';
  }
}

function getPageLabel(pageId: string): string {
  try {
    const parsed = new URL(pageId);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return pageId;
  }
}

async function sendMutation(
  transport: AnnotationRuntimeTransport,
  command: AnnotationMutationCommand,
): Promise<AnnotationMutationResult> {
  try {
    const response = await transport.sendMessage(command);
    return parseAnnotationMutationResult(response) ?? invalidResponse();
  } catch {
    return mutationFailure('transport-error', 'Unable to reach the annotation writer.');
  }
}

function invalidResponse(): AnnotationMutationFailedResult {
  return mutationFailure('invalid-response', 'The annotation writer returned an invalid response.');
}

function mutationFailure(
  code: AnnotationMutationFailedResult['code'],
  message: string,
): AnnotationMutationFailedResult {
  return { _tag: 'failed', code, message };
}

function casesHandled(value: never): never {
  throw new Error(`Unexpected annotation command: ${String(value)}`);
}
