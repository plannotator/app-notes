import { describe, expect, test } from 'bun:test';
import {
  createLocalFolderWorkspace,
  formatAllAnnotationsMarkdown,
} from './local-folder';
import type {
  LocalFolderConnection,
  LocalFolderRepository,
} from './local-folder';
import type { Annotation, AnnotationScreenshotCapture } from './types';

describe('local-folder workspace', () => {
  test('stays unavailable on unsupported browser builds', async () => {
    const repository = new InMemoryRepository();
    const workspace = createLocalFolderWorkspace(repository, false);

    expect(await workspace.getState()).toEqual({ _tag: 'unsupported' });
    expect(await workspace.writeScreenshot(screenshotCapture())).toBe(false);
  });

  test('persists the chosen handle and writes Markdown plus PNG files', async () => {
    const repository = new InMemoryRepository();
    const directory = new InMemoryDirectoryHandle('agent-notes', 'granted');
    const workspace = createLocalFolderWorkspace(repository, true);
    const annotation = screenshotAnnotation();

    expect(await workspace.connect(directory, [annotation])).toEqual({
      _tag: 'connected',
      name: 'agent-notes',
    });
    expect((await repository.load())?.handle).toBe(directory);
    expect(await workspace.writeScreenshot(screenshotCapture())).toBe(true);
    await workspace.sync([annotation]);

    expect(directory.readText('app-notes.md')).toContain(
      '![Screenshot of Pricing card](<screenshots/annotation-pricing.png>)',
    );
    expect(directory.readBlob('screenshots/annotation-pricing.png')?.type).toBe('image/png');
  });

  test('requires currently granted write permission and supports reconnect', async () => {
    const repository = new InMemoryRepository();
    const directory = new InMemoryDirectoryHandle('agent-notes', 'prompt');
    await repository.save({ handle: directory, syncError: null });
    const workspace = createLocalFolderWorkspace(repository, true);

    expect(await workspace.getState()).toEqual({ _tag: 'reconnect', name: 'agent-notes' });
    expect(await workspace.writeScreenshot(screenshotCapture())).toBe(false);

    directory.setRequestPermission('granted');
    expect(await workspace.reconnect([])).toEqual({ _tag: 'connected', name: 'agent-notes' });
    expect(directory.readText('app-notes.md')).toContain('No annotations yet.');
  });

  test('surfaces a sync error without discarding the persisted handle', async () => {
    const repository = new InMemoryRepository();
    const directory = new InMemoryDirectoryHandle('read-only-now', 'granted');
    const workspace = createLocalFolderWorkspace(repository, true);
    await repository.save({ handle: directory, syncError: null });
    directory.failWrites();

    await workspace.sync([screenshotAnnotation()]);

    expect(await workspace.getState()).toEqual({
      _tag: 'sync-error',
      name: 'read-only-now',
      message: 'Couldn’t sync notes to the connected folder.',
    });
  });
});

describe('local-folder Markdown', () => {
  test('keeps screenshot links relative and deterministic', () => {
    const markdown = formatAllAnnotationsMarkdown([screenshotAnnotation()]);

    expect(markdown.startsWith('# App Notes')).toBe(true);
    expect(markdown).toContain('screenshots/annotation-pricing.png');
    expect(markdown).toContain('Tighten this section');
  });
});

class InMemoryRepository implements LocalFolderRepository {
  private connection: LocalFolderConnection | null = null;

  async load(): Promise<LocalFolderConnection | null> {
    return this.connection;
  }

  async save(connection: LocalFolderConnection): Promise<void> {
    this.connection = connection;
  }
}

class InMemoryDirectoryHandle implements AppNotesFileSystemDirectoryHandle {
  readonly kind: 'directory' = 'directory';
  private readonly directories = new Map<string, InMemoryDirectoryHandle>();
  private readonly files = new Map<string, Blob | string>();
  private permission: PermissionState;
  private requestedPermission: PermissionState;
  private writeFailure = false;

  constructor(readonly name: string, permission: PermissionState) {
    this.permission = permission;
    this.requestedPermission = permission;
  }

  async getDirectoryHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<AppNotesFileSystemDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing !== undefined) return existing;
    if (options?.create !== true) throw new DOMException('Missing directory', 'NotFoundError');
    const directory = new InMemoryDirectoryHandle(name, this.permission);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<AppNotesFileSystemFileHandle> {
    if (!this.files.has(name) && options?.create !== true) {
      throw new DOMException('Missing file', 'NotFoundError');
    }
    return new InMemoryFileHandle(name, this.files, () => this.writeFailure);
  }

  async queryPermission(): Promise<PermissionState> {
    return this.permission;
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.files.delete(name) && !this.directories.delete(name)) {
      throw new DOMException('Missing entry', 'NotFoundError');
    }
  }

  async requestPermission(): Promise<PermissionState> {
    this.permission = this.requestedPermission;
    return this.permission;
  }

  failWrites(): void {
    this.writeFailure = true;
  }

  readBlob(path: string): Blob | null {
    const [directoryName, filename] = path.split('/');
    if (directoryName === undefined || filename === undefined) return null;
    const value = this.directories.get(directoryName)?.files.get(filename);
    return value instanceof Blob ? value : null;
  }

  readText(name: string): string {
    const value = this.files.get(name);
    return typeof value === 'string' ? value : '';
  }

  setRequestPermission(permission: PermissionState): void {
    this.requestedPermission = permission;
  }
}

class InMemoryFileHandle implements AppNotesFileSystemFileHandle {
  readonly kind: 'file' = 'file';

  constructor(
    readonly name: string,
    private readonly files: Map<string, Blob | string>,
    private readonly shouldFail: () => boolean,
  ) {}

  async createWritable(): Promise<AppNotesFileSystemWritableFileStream> {
    const { files, name, shouldFail } = this;
    return {
      abort: async () => undefined,
      close: async () => undefined,
      write: async (data) => {
        if (shouldFail()) throw new DOMException('Write denied', 'NotAllowedError');
        files.set(name, data);
      },
    };
  }
}

function screenshotAnnotation(): Annotation {
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

function screenshotCapture(): AnnotationScreenshotCapture {
  return {
    id: 'annotation-pricing',
    mimeType: 'image/png',
    width: 640,
    height: 360,
    dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
  };
}
