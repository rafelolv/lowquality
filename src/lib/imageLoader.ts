import {
  MAX_STATIC_DIMENSION,
  MAX_STATIC_FILE_BYTES,
  MAX_STATIC_PIXELS,
  MAX_SVG_FILE_BYTES,
} from './constants';

export interface DecodedStaticImage {
  width: number;
  height: number;
  hasAlpha: boolean;
  bitmap: ImageBitmap;
  pixels: Uint8ClampedArray;
}

export interface FileFormatInfo {
  format: string;
  mime: string;
  animated: boolean;
}

const EXTENSION_FORMATS: Record<string, { format: string; mime: string }> = {
  jpg: { format: 'JPEG', mime: 'image/jpeg' },
  jpeg: { format: 'JPEG', mime: 'image/jpeg' },
  jfif: { format: 'JPEG', mime: 'image/jpeg' },
  png: { format: 'PNG', mime: 'image/png' },
  webp: { format: 'WebP', mime: 'image/webp' },
  gif: { format: 'GIF', mime: 'image/gif' },
  bmp: { format: 'BMP', mime: 'image/bmp' },
  avif: { format: 'AVIF', mime: 'image/avif' },
  svg: { format: 'SVG', mime: 'image/svg+xml' },
  ico: { format: 'ICO', mime: 'image/x-icon' },
  apng: { format: 'APNG', mime: 'image/png' },
};

const MIME_FORMATS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/pjpeg': 'JPEG',
  'image/png': 'PNG',
  'image/apng': 'APNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/bmp': 'BMP',
  'image/x-ms-bmp': 'BMP',
  'image/avif': 'AVIF',
  'image/svg+xml': 'SVG',
  'image/x-icon': 'ICO',
  'image/vnd.microsoft.icon': 'ICO',
};

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : '';
}

export function getFileFormat(file: File): FileFormatInfo {
  const extension = extensionOf(file.name);
  const extensionInfo = EXTENSION_FORMATS[extension];
  const mime = file.type.toLowerCase() || extensionInfo?.mime || '';
  const animated = mime === 'image/gif' || extension === 'gif';
  const format =
    MIME_FORMATS[mime] ??
    extensionInfo?.format ??
    (mime.startsWith('image/') ? mime.replace('image/', '').toUpperCase() : 'Unknown');

  return { format, mime: mime || extensionInfo?.mime || '', animated };
}

export function isGifFile(file: File): boolean {
  return getFileFormat(file).animated;
}

export function isHeicFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  const extension = extensionOf(file.name);
  return (
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    extension === 'heic' ||
    extension === 'heif'
  );
}

export function validateStaticFile(file: File): FileFormatInfo {
  if (isHeicFile(file)) {
    throw new Error(
      'HEIC/HEIF is not supported by this browser. Export the photo as JPEG or PNG first.',
    );
  }

  const format = getFileFormat(file);
  const extension = extensionOf(file.name);
  const knownExtension = Boolean(EXTENSION_FORMATS[extension]);
  const isImage = format.mime.startsWith('image/') || knownExtension;

  if (!isImage) {
    throw new Error('That file does not look like an image. Try a JPEG, PNG, WebP, GIF, BMP, AVIF or SVG.');
  }
  if (format.mime === 'image/gif' || extension === 'gif') {
    return format;
  }
  if (file.size > MAX_STATIC_FILE_BYTES) {
    throw new Error('That image is larger than 30 MB. Try a smaller file.');
  }
  if (format.mime === 'image/svg+xml' || extension === 'svg') {
    if (file.size > MAX_SVG_FILE_BYTES) {
      throw new Error('SVG files need to be under 5 MB to keep things safe.');
    }
  }
  return format;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width.toLocaleString('en-US')} × ${height.toLocaleString('en-US')}`;
}

function hasAnyTransparency(data: Uint8ClampedArray): boolean {
  // Checking every fourth byte is cheap relative to decoding, but we can stride
  // for very large images while still catching normal transparency.
  const stride = data.length > 16_000_000 ? 8 : 4;
  for (let i = 3; i < data.length; i += stride) {
    if (data[i] < 255) return true;
  }
  return false;
}

function ensureValidDimensions(width: number, height: number): void {
  if (
    width < 1 ||
    height < 1 ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    throw new Error('This image has invalid dimensions.');
  }
  if (width > MAX_STATIC_DIMENSION || height > MAX_STATIC_DIMENSION) {
    throw new Error(
      `Images can be up to ${MAX_STATIC_DIMENSION.toLocaleString('en-US')}px on a side. This one is ${width} × ${height}.`,
    );
  }
  if (width * height > MAX_STATIC_PIXELS) {
    throw new Error(
      'That image has too many pixels for safe in-browser processing. Try reducing it below 32 megapixels.',
    );
  }
}

function readSvgDimensions(source: Document): { width: number; height: number } | null {
  const root = source.documentElement;
  if (!root) return null;

  const numeric = (value: string | null): number | null => {
    if (!value || value.includes('%')) return null;
    const match = /^\s*([\d.]+)/.exec(value);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const width = numeric(root.getAttribute('width'));
  const height = numeric(root.getAttribute('height'));
  if (width && height) return { width, height };

  const viewBox = root.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return width ? { width, height: width } : height ? { width: height, height } : null;
}

function sanitizeCss(css: string): string {
  return css
    .replace(/@import[^;]+;/gi, '')
    .replace(/url\s*\(\s*(['"]?)(?!#|data:)[^)]*\1\s*\)/gi, 'none');
}

/** Removes scripts, event handlers and external network references from SVG. */
export function sanitizeSvg(sourceText: string): string {
  const parser = new DOMParser();
  const document = parser.parseFromString(sourceText, 'image/svg+xml');
  if (document.querySelector('parsererror')) {
    throw new Error('This SVG could not be parsed safely.');
  }

  document
    .querySelectorAll('script, foreignObject, iframe, object, embed, audio, video')
    .forEach((element) => element.remove());

  const allElements = document.querySelectorAll('*');
  allElements.forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (name === 'href' || name === 'xlink:href') {
        const value = attribute.value.trim();
        if (!value.startsWith('#') && !/^data:image\//i.test(value)) {
          element.removeAttribute(attribute.name);
        }
      }
      if (name === 'style') {
        element.setAttribute('style', sanitizeCss(attribute.value));
      }
    }
  });

  document.querySelectorAll('style').forEach((element) => {
    element.textContent = sanitizeCss(element.textContent ?? '');
  });

  return new XMLSerializer().serializeToString(document);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error('This image could not be decoded by your browser.'));
    image.src = url;
  });
}

async function decodeWithFallback(fileOrBlob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(fileOrBlob);
    try {
      return await loadHtmlImage(url);
    } finally {
      // The image has decoded by now; the URL can be released later by the
      // caller after drawing. Revoke on a microtask once draw calls are done.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

export async function decodeStaticImage(file: File): Promise<DecodedStaticImage> {
  const format = validateStaticFile(file);
  let source: ImageBitmap | HTMLImageElement;
  let svgDimensions: { width: number; height: number } | null = null;

  if (format.mime === 'image/svg+xml' || extensionOf(file.name) === 'svg') {
    const raw = await file.text();
    const sanitized = sanitizeSvg(raw);
    const parsed = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
    svgDimensions = readSvgDimensions(parsed);
    const blob = new Blob([sanitized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      source = await loadHtmlImage(url);
    } catch {
      throw new Error(
        'This SVG could not be drawn safely. It may use unsupported features or hidden external resources.',
      );
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  } else {
    try {
      source = await decodeWithFallback(file);
    } catch {
      throw new Error(
        'This file could not be decoded. It may be corrupt or unsupported by this browser.',
      );
    }
  }

  const naturalWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const naturalHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  let width = svgDimensions?.width ?? naturalWidth;
  let height = svgDimensions?.height ?? naturalHeight;

  if (!width || !height) {
    if ('close' in source) source.close();
    throw new Error('This image has no readable dimensions.');
  }

  // Rasterise SVGs at a sensible size instead of trusting arbitrary decimal units.
  const scale = Math.min(
    1,
    MAX_STATIC_DIMENSION / Math.max(width, height),
    Math.sqrt(MAX_STATIC_PIXELS / (width * height)),
  );
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  ensureValidDimensions(width, height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    if ('close' in source) source.close();
    throw new Error('This browser cannot create the canvas needed to process images.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, width, height);
  } catch {
    throw new Error(
      'This image could not be read locally. It may contain protected or external content.',
    );
  }

  const bitmap = await createImageBitmap(canvas);
  return {
    width,
    height,
    hasAlpha: hasAnyTransparency(imageData.data),
    bitmap,
    pixels: imageData.data,
  };
}

export async function fetchSampleImage(): Promise<File> {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const response = await fetch(`${base}samples/sample-original.png`);
  if (!response.ok) throw new Error('The sample image could not be loaded.');
  const blob = await response.blob();
  return new File([blob], 'sample-street.png', { type: 'image/png' });
}
