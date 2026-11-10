import type { ExportFormat, ImageSession } from '../types';

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  gif: 'gif',
};

const EXPORT_MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export function exportMime(format: ExportFormat): string {
  return EXPORT_MIME[format];
}

export function exportExtension(format: ExportFormat): string {
  return EXPORT_EXTENSIONS[format];
}

function safeBaseName(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]+$/i, '');
  const slug = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || (name.toLowerCase().includes('gif') ? 'animation' : 'image');
}

export function buildDownloadName(
  session: ImageSession,
  format: ExportFormat,
): string {
  const fallback = session.kind === 'gif' ? 'animation' : 'image';
  const base = safeBaseName(session.name) || fallback;
  return `lowquality-${base}.${exportExtension(format)}`;
}

export function buildConvertedName(
  sourceName: string,
  format: Exclude<ExportFormat, 'gif'>,
): string {
  return `${safeBaseName(sourceName)}.${exportExtension(format)}`;
}

export function buildCompressedName(
  sourceName: string,
  format: Exclude<ExportFormat, 'png' | 'gif'>,
): string {
  return `${safeBaseName(sourceName)}-compressed.${exportExtension(format)}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function supportsClipboardImages(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard !== 'undefined' &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

export async function copyBlobToClipboard(blob: Blob): Promise<void> {
  if (!supportsClipboardImages()) {
    throw new Error('Copying images is not supported by this browser.');
  }
  if (blob.type !== 'image/png') {
    throw new Error('Only PNG images can be copied to the clipboard.');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}

export interface BrowserSupport {
  supported: boolean;
  reason: string;
}

export function checkBrowserSupport(): BrowserSupport {
  if (typeof Worker === 'undefined') {
    return {
      supported: false,
      reason: 'This browser does not support Web Workers, which LowQuality needs for local processing.',
    };
  }
  if (typeof OffscreenCanvas === 'undefined') {
    return {
      supported: false,
      reason: 'This browser does not support OffscreenCanvas. Try a recent Chrome, Firefox, Safari or Edge.',
    };
  }
  if (typeof createImageBitmap !== 'function') {
    return {
      supported: false,
      reason: 'This browser does not support the image decoding APIs used by LowQuality.',
    };
  }
  return { supported: true, reason: '' };
}

export function formatDuration(milliseconds: number): string {
  const seconds = milliseconds / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

export function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\/+/, '')}`;
}
