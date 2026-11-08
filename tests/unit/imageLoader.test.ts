import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  formatDimensions,
  formatFileSize,
  formatFrameCount,
  getFileFormat,
  isGifFile,
  isHeicFile,
  validateStaticFile,
} from '../../src/lib/imageLoader';

function file(name: string, type = '', bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('image file inspection', () => {
  it('extracts lower-case extensions', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg');
    expect(extensionOf('archive.photo.webp')).toBe('webp');
    expect(extensionOf('no-extension')).toBe('');
  });

  it('prefers MIME types and falls back to extensions', () => {
    expect(getFileFormat(file('photo.png', 'image/png'))).toEqual({
      format: 'PNG',
      mime: 'image/png',
      animated: false,
    });
    expect(getFileFormat(file('photo.jpeg'))).toEqual({
      format: 'JPEG',
      mime: 'image/jpeg',
      animated: false,
    });
    expect(getFileFormat(file('loop.GIF', ''))).toMatchObject({
      format: 'GIF',
      animated: true,
    });
    expect(getFileFormat(file('weird.bin', 'image/avif'))).toEqual({
      format: 'AVIF',
      mime: 'image/avif',
      animated: false,
    });
  });

  it('detects GIFs and HEIC/HEIF files by MIME or extension', () => {
    expect(isGifFile(file('anim.gif', ''))).toBe(true);
    expect(isGifFile(file('anim.png', 'image/png'))).toBe(false);
    expect(isHeicFile(file('IMG_0001.HEIC'))).toBe(true);
    expect(isHeicFile(file('photo.heif', ''))).toBe(true);
    expect(isHeicFile(file('photo.jpg', 'image/jpeg'))).toBe(false);
  });

  it('rejects unsupported and HEIC files with useful messages', () => {
    expect(() => validateStaticFile(file('notes.txt', 'text/plain'))).toThrow(
      /does not look like an image/i,
    );
    expect(() => validateStaticFile(file('IMG_0001.HEIC', 'image/heic'))).toThrow(
      /HEIC\/HEIF is not supported/i,
    );
    expect(validateStaticFile(file('photo.png', 'image/png')).format).toBe('PNG');
  });

  it('formats sizes and dimensions consistently', () => {
    expect(formatFileSize(12)).toBe('12 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(20 * 1024)).toBe('20 KB');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatFileSize(12 * 1024 * 1024)).toBe('12 MB');
    expect(formatDimensions(1920, 1080)).toBe('1,920 × 1,080');
    expect(formatFrameCount(1)).toBe('1 frame');
    expect(formatFrameCount(2)).toBe('2 frames');
    expect(formatFrameCount(0)).toBe('0 frames');
  });
});
