import { applyPalette, quantize } from "gifenc";
import { decompressFrame, type ParsedFrame, type ParsedGif } from "gifuct-js";
import { assertGifSourceSize } from "./constants";
import { hasTransparency } from "./effects";

/**
 * Browsers display GIF frames of 10ms or less for 100ms. Matching that clamp
 * keeps exported animations at the same speed as the original file.
 */
export const GIF_MIN_DELAY = 10;
export const GIF_DEFAULT_DELAY = 100;

export function normalizeGifDelay(delay: number): number {
  if (!Number.isFinite(delay) || delay <= 0) return GIF_DEFAULT_DELAY;
  const rounded = Math.round(delay / 10) * 10;
  return rounded <= GIF_MIN_DELAY ? GIF_DEFAULT_DELAY : rounded;
}

interface ApplicationFrame {
  application?: {
    id?: string;
    blocks?: number[] | Record<string, number>;
  };
}

/** Reads the NETSCAPE2.0 loop block. Returns -1 when the GIF should play once. */
export function extractGifLoopCount(parsed: ParsedGif): number {
  for (const frame of parsed.frames as ApplicationFrame[]) {
    const app = frame.application;
    if (!app?.id || !app.blocks) continue;
    if (app.id !== "NETSCAPE2.0" && app.id !== "ANIMEXTS1.0") continue;
    const blocks = app.blocks;
    // gifuct-js exposes NETSCAPE block bytes either as an array or as an
    // object keyed by byte index, depending on the build/parser path.
    const low = Array.isArray(blocks)
      ? Number(blocks[1] ?? 0)
      : Number(blocks["1"] ?? blocks[1] ?? 0);
    const high = Array.isArray(blocks)
      ? Number(blocks[2] ?? 0)
      : Number(blocks["2"] ?? blocks[2] ?? 0);
    return low | (high << 8);
  }
  return -1;
}

export interface GifBackground {
  rgba: [number, number, number, number];
  transparent: boolean;
}

export function getGifBackground(
  parsed: ParsedGif,
  frames: Array<{ transparentIndex?: number }>,
): GifBackground {
  const transparent = frames.some(
    (frame) => typeof frame.transparentIndex === "number",
  );
  if (transparent) {
    return { rgba: [0, 0, 0, 0], transparent: true };
  }
  const color = parsed.gct?.[parsed.lsd.backgroundColorIndex];
  if (color) {
    return { rgba: [color[0], color[1], color[2], 255], transparent: false };
  }
  return { rgba: [0, 0, 0, 255], transparent: false };
}

/** Decode one patch at a time, never retaining every full-size source patch. */
export function* decodeGifFrames(parsed: ParsedGif): Generator<ParsedFrame> {
  assertGifSourceSize(parsed.lsd.width, parsed.lsd.height);
  for (const frame of parsed.frames) {
    if (!("image" in frame) || !frame.image) continue;
    const { width, height } = frame.image.descriptor;
    assertGifSourceSize(width, height);
    yield decompressFrame(frame, parsed.gct, true);
  }
}

export interface CompositedGifFrame {
  pixels: Uint8ClampedArray;
  delay: number;
}

/**
 * Draws GIF patches onto a full logical-screen canvas while respecting disposal
 * methods. Each yielded frame is a complete, independently displayable image.
 */
export function* compositeGifFrames(
  frames: Iterable<ParsedFrame>,
  width: number,
  height: number,
  background: GifBackground,
): Generator<CompositedGifFrame> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const [br, bg, bb, ba] = background.rgba;

  if (ba > 0) {
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = br;
      pixels[i + 1] = bg;
      pixels[i + 2] = bb;
      pixels[i + 3] = ba;
    }
  }

  let previousDisposal = 0;
  let previousRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;
  let previousSnapshot: Uint8ClampedArray | null = null;

  for (const frame of frames) {
    if (previousDisposal === 2 && previousRect) {
      clearRect(
        pixels,
        width,
        height,
        previousRect.left,
        previousRect.top,
        previousRect.width,
        previousRect.height,
        background,
      );
    } else if (previousDisposal === 3 && previousSnapshot) {
      pixels.set(previousSnapshot);
    }

    const disposal = frame.disposalType ?? 1;
    previousSnapshot = disposal === 3 ? new Uint8ClampedArray(pixels) : null;

    drawPatch(pixels, width, height, frame);

    previousDisposal = disposal;
    previousRect = {
      left: frame.dims.left,
      top: frame.dims.top,
      width: frame.dims.width,
      height: frame.dims.height,
    };

    yield {
      pixels: new Uint8ClampedArray(pixels),
      delay: normalizeGifDelay(frame.delay),
    };
  }
}

function clearRect(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  left: number,
  top: number,
  rectWidth: number,
  rectHeight: number,
  background: GifBackground,
): void {
  const startX = Math.max(0, left);
  const startY = Math.max(0, top);
  const endX = Math.min(width, left + rectWidth);
  const endY = Math.min(height, top + rectHeight);
  const [r, g, b, a] = background.rgba;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = a;
    }
  }
}

function drawPatch(
  target: Uint8ClampedArray,
  width: number,
  height: number,
  frame: ParsedFrame,
): void {
  const { patch, dims } = frame;
  const startX = Math.max(0, dims.left);
  const startY = Math.max(0, dims.top);
  const endX = Math.min(width, dims.left + dims.width);
  const endY = Math.min(height, dims.top + dims.height);

  for (let y = startY; y < endY; y += 1) {
    const patchY = y - dims.top;
    for (let x = startX; x < endX; x += 1) {
      const patchX = x - dims.left;
      const patchIndex = (patchY * dims.width + patchX) * 4;
      const alpha = patch[patchIndex + 3];
      if (alpha === 0) continue;
      const targetIndex = (y * width + x) * 4;
      target[targetIndex] = patch[patchIndex];
      target[targetIndex + 1] = patch[patchIndex + 1];
      target[targetIndex + 2] = patch[patchIndex + 2];
      target[targetIndex + 3] = alpha;
    }
  }
}

export interface PreparedGifFrame {
  indices: Uint8Array;
  palette: number[][];
  transparent: boolean;
  transparentIndex: number;
}

/**
 * Quantises one RGBA frame for GIF output. Transparency is thresholded to the
 * 1-bit alpha that GIF supports, and a transparent palette slot is guaranteed.
 */
export function prepareGifFrame(
  source: Uint8ClampedArray,
  width: number,
  height: number,
): PreparedGifFrame {
  const rgba = new Uint8ClampedArray(source);
  const transparent = hasTransparency(rgba, 255);

  if (transparent) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 128) {
        rgba[i] = 0;
        rgba[i + 1] = 0;
        rgba[i + 2] = 0;
        rgba[i + 3] = 0;
      } else {
        rgba[i + 3] = 255;
      }
    }
  }

  let palette = quantize(rgba, transparent ? 255 : 256, {
    format: transparent ? "rgba4444" : "rgb565",
    oneBitAlpha: transparent,
    clearAlpha: transparent,
    clearAlphaThreshold: 127,
    clearAlphaColor: 0,
  });

  let transparentIndex = transparent
    ? palette.findIndex((color) => color.length > 3 && color[3] === 0)
    : -1;

  if (transparent && transparentIndex === -1) {
    // Put a guaranteed clear slot at index zero.
    palette = [[0, 0, 0, 0], ...palette].slice(0, 256);
    transparentIndex = 0;
  }

  const indices = applyPalette(
    rgba,
    palette,
    transparent ? "rgba4444" : "rgb565",
  );

  if (transparent && transparentIndex >= 0) {
    for (let i = 0, pixel = 0; i < rgba.length; i += 4, pixel += 1) {
      if (rgba[i + 3] === 0) indices[pixel] = transparentIndex;
    }
  }

  void width;
  void height;

  return {
    indices,
    palette,
    transparent,
    transparentIndex: Math.max(0, transparentIndex),
  };
}
