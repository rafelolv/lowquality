import { formatFileSize } from './imageLoader';

const KB = 1024;
const MB = 1024 * KB;
/** Tiny files still deserve a sensible lower bound. */
const MIN_TARGET_BYTES = 64;

const PRESET_TARGETS = [
  2 * MB,
  MB,
  500 * KB,
  250 * KB,
  100 * KB,
  50 * KB,
];

const PERCENT_TARGETS = [0.75, 0.5, 0.25] as const;

const DIMENSION_CAPS = [
  { value: 3840, label: '4K' },
  { value: 2560, label: '2K' },
  { value: 1920, label: '1080p' },
  { value: 1280, label: '720p' },
] as const;

export interface DimensionOption {
  value: number;
  label: string;
}

export interface CompressionTarget {
  bytes: number;
  label: string;
}

/**
 * Targets shown in the compressor. Fixed sizes are useful for upload limits;
 * percentage options guarantee real choices on sources of any size.
 */
export function compressionTargets(sourceBytes: number): CompressionTarget[] {
  const candidates = new Map<number, string>();

  for (const preset of PRESET_TARGETS) {
    if (preset < sourceBytes * 0.9) {
      candidates.set(preset, formatFileSize(preset));
    }
  }

  for (const share of PERCENT_TARGETS) {
    const bytes = Math.max(1, Math.round(sourceBytes * share));
    if (bytes < sourceBytes * 0.9 && !candidates.has(bytes)) {
      candidates.set(
        bytes,
        `${Math.round(share * 100)}% · ${formatFileSize(bytes)}`,
      );
    }
  }

  if (candidates.size === 0) {
    const bytes = Math.max(1, Math.round(sourceBytes * 0.5));
    candidates.set(bytes, `50% · ${formatFileSize(bytes)}`);
  }

  return [...candidates]
    .sort(([left], [right]) => right - left)
    .map(([bytes, label]) => ({ bytes, label }));
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

/** Resolution caps that actually constrain this image. */
export function dimensionOptions(
  width: number,
  height: number,
): DimensionOption[] {
  const sourceMax = Math.max(width, height);
  return [
    { value: 0, label: "Original" },
    ...DIMENSION_CAPS.filter((cap) => cap.value < sourceMax * 0.98),
  ];
}

/** Parse a custom target in MB, rejecting sizes that would grow the file. */
export function parseTargetMb(
  value: string,
  sourceBytes: number,
): number | null {
  const megabytes = Number(value.replace(',', '.'));
  if (!Number.isFinite(megabytes) || megabytes <= 0) return null;
  const bytes = Math.round(megabytes * MB);
  if (bytes < MIN_TARGET_BYTES || bytes >= sourceBytes) return null;
  return bytes;
}

export function formatTargetMb(bytes: number): string {
  const megabytes = bytes / MB;
  const digits = megabytes < 0.001 ? 5 : megabytes < 0.1 ? 3 : 2;
  return megabytes
    .toFixed(digits)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
}
