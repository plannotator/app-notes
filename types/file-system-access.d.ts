interface AppNotesFileSystemWritableFileStream {
  abort(): Promise<void>;
  close(): Promise<void>;
  write(data: Blob | string): Promise<void>;
}

interface AppNotesFileSystemFileHandle {
  readonly kind: 'file';
  readonly name: string;
  createWritable(): Promise<AppNotesFileSystemWritableFileStream>;
}

interface AppNotesFileSystemDirectoryHandle {
  readonly kind: 'directory';
  readonly name: string;
  getDirectoryHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<AppNotesFileSystemDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { readonly create?: boolean },
  ): Promise<AppNotesFileSystemFileHandle>;
  queryPermission(descriptor?: { readonly mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  removeEntry(name: string, options?: { readonly recursive?: boolean }): Promise<void>;
  requestPermission(descriptor?: { readonly mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface Window {
  showDirectoryPicker?: (options?: {
    readonly id?: string;
    readonly mode?: 'read' | 'readwrite';
  }) => Promise<AppNotesFileSystemDirectoryHandle>;
}
