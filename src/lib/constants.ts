export const MAX_STATIC_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_STATIC_DIMENSION = 8192;
export const MAX_STATIC_PIXELS = 32_000_000;
export const MAX_SVG_FILE_BYTES = 5 * 1024 * 1024;

export const MAX_GIF_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_GIF_DIMENSION = 1600;
export const MAX_GIF_FRAMES = 240;
export const MAX_GIF_TOTAL_PIXELS = 36_000_000;
// A scaled GIF still needs a full-size source canvas for correct disposal.
export const MAX_GIF_SOURCE_PIXELS = 8_000_000;

export function assertGifSourceSize(width: number, height: number): void {
  if (width < 1 || height < 1 || width * height > MAX_GIF_SOURCE_PIXELS) {
    throw new Error(
      "This GIF exceeds the 8 megapixel source-frame limit. Resize it in another tool before uploading; preview scaling cannot reduce decoding memory.",
    );
  }
}

export const PREVIEW_MAX_DIMENSION = 1400;
export const GIF_PREVIEW_MAX_DIMENSION = 900;
export const GIF_PREVIEW_PIXEL_BUDGET = 14_000_000;

export const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
export const GIF_OUTPUT_SCALES = [1, 0.75, 0.5, 0.25] as const;

export function requiredGifLoadScale(
  width: number,
  height: number,
  frameCount: number,
): number {
  const dimensionScale = Math.min(
    1,
    MAX_GIF_DIMENSION / Math.max(width, height),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(MAX_GIF_TOTAL_PIXELS / Math.max(1, width * height * frameCount)),
  );
  return Math.min(dimensionScale, pixelScale);
}

export function fitScaleOptions(requiredScale: number): number[] {
  const safe = Math.max(0.02, Math.min(1, requiredScale));
  // Full size is not a downscale option; the dialog only appears when a scale
  // below 1 is actually required.
  const candidates = [safe, 0.75, 0.5, 0.25, 0.1];
  const unique = new Set<number>();
  for (const scale of candidates) {
    if (scale < 0.999 && scale <= safe + 0.001 && scale >= 0.02) {
      unique.add(Math.round(scale * 1000) / 1000);
    }
  }
  return Array.from(unique).sort((a, b) => b - a);
}
