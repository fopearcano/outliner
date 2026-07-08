// Ambient types for the parts of the File System Access API that aren't in the
// standard TS lib yet (the pickers and the permission methods).
export {};

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
  }

  interface Window {
    showSaveFilePicker?(options?: {
      suggestedName?: string;
      types?: FilePickerAcceptType[];
    }): Promise<FileSystemFileHandle>;
    showOpenFilePicker?(options?: {
      multiple?: boolean;
      types?: FilePickerAcceptType[];
    }): Promise<FileSystemFileHandle[]>;
  }
}
