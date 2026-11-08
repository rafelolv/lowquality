import type { GifPreflight } from "../types";
import { assertGifSourceSize } from "./constants";

/**
 * Cheaply walks the GIF block structure without decompressing frame pixels.
 * This lets the UI warn before allocating a huge animation.
 */
export function probeGif(buffer: ArrayBuffer): GifPreflight {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 20) {
    throw new Error("This file is too short to be a GIF.");
  }

  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new Error("This file is not a valid GIF.");
  }

  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  if (width < 1 || height < 1) {
    throw new Error("This GIF has invalid dimensions.");
  }

  assertGifSourceSize(width, height);

  const packed = bytes[10];
  let position = 13;
  if ((packed & 0x80) !== 0) {
    const colorEntries = 1 << ((packed & 0x07) + 1);
    position += colorEntries * 3;
  }

  let frameCount = 0;
  let iterations = 0;
  const maxIterations = Math.max(1024, bytes.length);

  while (position < bytes.length && iterations < maxIterations) {
    iterations += 1;
    const marker = bytes[position];
    position += 1;

    if (marker === 0x3b) break; // trailer

    if (marker === 0x21) {
      // Extension: label followed by sub-blocks.
      if (position >= bytes.length) break;
      position += 1;
      while (position < bytes.length) {
        const blockSize = bytes[position];
        position += 1;
        if (blockSize === 0) break;
        position += blockSize;
      }
      continue;
    }

    if (marker === 0x2c) {
      frameCount += 1;
      if (position + 9 > bytes.length) break;
      const patchWidth = bytes[position + 4] | (bytes[position + 5] << 8);
      const patchHeight = bytes[position + 6] | (bytes[position + 7] << 8);
      assertGifSourceSize(patchWidth, patchHeight);
      const imagePacked = bytes[position + 8];
      position += 9;

      if ((imagePacked & 0x80) !== 0) {
        const localEntries = 1 << ((imagePacked & 0x07) + 1);
        position += localEntries * 3;
      }

      // LZW minimum code size, then data sub-blocks.
      position += 1;
      while (position < bytes.length) {
        const blockSize = bytes[position];
        position += 1;
        if (blockSize === 0) break;
        position += blockSize;
      }
      continue;
    }

    // Unknown marker. Stop rather than reading arbitrary data.
    break;
  }

  if (frameCount === 0) {
    throw new Error("This GIF does not contain any image frames.");
  }

  return {
    width,
    height,
    frameCount,
    totalPixels: width * height * frameCount,
  };
}
