import { describe, expect, it } from 'vitest';
import type { ImageSession } from '../../src/types';
import {
  buildDownloadName,
  exportExtension,
  exportMime,
  formatDuration,
} from '../../src/lib/files';

function session(name: string, kind: ImageSession['kind'] = 'static'): ImageSession {
  return {
    kind,
    sessionId: 'test',
    name,
    type: kind === 'gif' ? 'image/gif' : 'image/png',
    size: 1234,
    format: kind === 'gif' ? 'GIF' : 'PNG',
    width: 10,
    height: 10,
  } as ImageSession;
}

describe('download names', () => {
  it('uses the correct extension and MIME type for every export format', () => {
    expect(exportExtension('png')).toBe('png');
    expect(exportExtension('jpeg')).toBe('jpg');
    expect(exportExtension('webp')).toBe('webp');
    expect(exportExtension('gif')).toBe('gif');
    expect(exportMime('jpeg')).toBe('image/jpeg');
    expect(exportMime('gif')).toBe('image/gif');
  });

  it('slugs source names and removes the old extension', () => {
    expect(buildDownloadName(session('My Photo (Final)!!.PNG'), 'png')).toBe(
      'lowquality-my-photo-final.png',
    );
    expect(buildDownloadName(session('Café déjà vu.jpeg'), 'jpeg')).toBe(
      'lowquality-cafe-deja-vu.jpg',
    );
    expect(buildDownloadName(session('dance.gif', 'gif'), 'gif')).toBe(
      'lowquality-dance.gif',
    );
  });

  it('falls back to a useful base name for hostile filenames', () => {
    expect(buildDownloadName(session('✨✨✨.png'), 'png')).toBe('lowquality-image.png');
    expect(buildDownloadName(session('✨✨✨.gif', 'gif'), 'gif')).toBe(
      'lowquality-animation.gif',
    );
  });

  it('caps very long names at a readable length', () => {
    const name = `${'a'.repeat(120)}.png`;
    expect(buildDownloadName(session(name), 'webp')).toBe(
      `lowquality-${'a'.repeat(48)}.webp`,
    );
  });

  it('formats GIF durations for the preview meta line', () => {
    expect(formatDuration(0)).toBe('0.0s');
    expect(formatDuration(1050)).toBe('1.1s');
    expect(formatDuration(9500)).toBe('9.5s');
    expect(formatDuration(10_000)).toBe('10s');
    expect(formatDuration(65_400)).toBe('65s');
  });
});
