export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const SOCIAL_PRESETS = [
  ["Custom", 0, 0],
  ["Instagram", 1080, 1080],
  ["Portrait", 1080, 1350],
  ["Story / Reel", 1080, 1920],
  ["YouTube", 1280, 720],
  ["X", 1600, 900],
  ["LinkedIn", 1200, 627],
] as const;
export const FAVICON_SIZES = [16, 32, 48, 180, 192, 512] as const;
export function dimension(value: number): number {
  return Math.max(1, Math.min(8192, Math.round(value) || 1));
}
export function fitSize(width: number, height: number, max: number) {
  const scale = max > 0 ? Math.min(1, max / Math.max(width, height)) : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export function clampCrop(rect: Rect, width: number, height: number): Rect {
  const w = Math.max(1, Math.min(width, rect.width));
  const h = Math.max(1, Math.min(height, rect.height));
  return {
    x: Math.max(0, Math.min(width - w, rect.x)),
    y: Math.max(0, Math.min(height - h, rect.y)),
    width: w,
    height: h,
  };
}
export function gifDelay(delay: number, speed: number): number {
  return Math.max(20, Math.round(delay / speed / 10) * 10);
}

export function squareCrop(width: number, height: number): Rect {
  const side = Math.min(width, height);
  return {
    x: (width - side) / 2,
    y: (height - side) / 2,
    width: side,
    height: side,
  };
}
export function aspectCrop(
  rect: Rect,
  width: number,
  height: number,
  aspect: number,
): Rect {
  const r = clampCrop(rect, width, height);
  const w = Math.max(1, Math.min(r.width, r.height * aspect));
  return { ...r, width: w, height: w / aspect };
}
