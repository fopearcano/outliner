// ---------------------------------------------------------------------------
// File → Attachment helpers. Everything is stored inline as a base64 data URL
// so the app stays fully local (no upload server).
// ---------------------------------------------------------------------------
import type { Attachment } from '../types';
import { newId } from './id';

/** Soft per-file ceiling. Big files bloat the local store, so we warn past this. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function isImage(type: string): boolean {
  return type.startsWith('image/');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileAsAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      reject(new Error(`"${file.name}" is ${formatBytes(file.size)} — over the ${formatBytes(MAX_ATTACHMENT_BYTES)} limit.`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.onload = () => {
      resolve({
        id: newId(),
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: String(reader.result),
        createdAt: Date.now(),
      });
    };
    reader.readAsDataURL(file);
  });
}

/** Read many files, skipping any that fail; returns attachments + error messages. */
export async function readFiles(
  files: FileList | File[],
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const attachments: Attachment[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    try {
      attachments.push(await readFileAsAttachment(file));
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return { attachments, errors };
}
