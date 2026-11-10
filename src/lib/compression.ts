import { formatFileSize } from './imageLoader';

const KB = 1024;
const MB = 1024 * KB;

const PRESET_TARGETS = [2 * MB, MB, 500 * KB, 250 * KB, 100 * KB];

export interface CompressionTarget {
  bytes: number;
  label: string;
}

/**
 * Targets shown in the compressor. The 50% option guarantees a meaningful
 * reduction even for images smaller than the lowest preset.
 */
export function compressionTargets(sourceBytes: number): CompressionTarget[] {
  const half = Math.max(1, Math.round(sourceBytes / 2));
  const candidates = new Set<number>();

  for (const preset of PRESET_TARGETS) {
    if (preset < sourceBytes * 0.9) candidates.add(preset);
  }
  if (half < sourceBytes * 0.9) candidates.add(half);
  if (candidates.size === 0) {
    candidates.add(Math.max(1, Math.round(sourceBytes * 0.75)));
  }

  return [...candidates]
    .sort((left, right) => right - left)
    .map((bytes) => ({
      bytes,
      label: bytes === half ? `50% · ${formatFileSize(bytes)}` : formatFileSize(bytes),
    }));
}

/** Pick the target closest to a 45% reduction. */
export function defaultCompressionTarget(sourceBytes: number): number {
  const targets = compressionTargets(sourceBytes);
  const ideal = sourceBytes * 0.55;
  let best = targets[0]?.bytes ?? Math.max(1, Math.round(sourceBytes / 2));

  for (const target of targets) {
    if (Math.abs(target.bytes - ideal) < Math.abs(best - ideal)) {
      best = target.bytes;
    }
  }

  return best;
}

export function reductionPercent(
  sourceBytes: number,
  outputBytes: number,
): number {
  if (sourceBytes <= 0) return 0;
  return Math.max(0, Math.round((1 - outputBytes / sourceBytes) * 100));
}
