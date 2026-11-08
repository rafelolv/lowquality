import { describe, expect, it } from "vitest";
import {
  addNoise,
  adjustColor,
  applyGlitch,
  bleedChroma,
  hashString,
  hasTransparency,
  mulberry32,
  preserveAlpha,
  reduceColors,
  sharpenImage,
} from "../../src/lib/effects";

function rgba(...pixels: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

describe("effect primitives", () => {
  it("bleeds colour while keeping luminance structure and alpha", () => {
    const source = rgba(
      [200, 60, 60, 255],
      [180, 80, 80, 128],
      [60, 60, 200, 255],
      [80, 80, 180, 0],
    );
    const output = bleedChroma(source, 2, 2, 100);
    expect(output).not.toEqual(source);
    const luma = (data: Uint8ClampedArray, index: number) =>
      0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    for (let index = 0; index < source.length; index += 4) {
      expect(Math.abs(luma(source, index) - luma(output, index))).toBeLessThan(
        1,
      );
      expect(output[index + 3]).toBe(source[index + 3]);
    }
    expect(output.slice(12)).toEqual(source.slice(12));
    expect(bleedChroma(source, 2, 2, 0)).toEqual(source);
    expect(source[0]).toBe(200);
  });

  it("retains fine grayscale gradients instead of forming nearest-neighbour blocks", () => {
    const width = 280;
    const height = 4;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        source[index] =
          source[index + 1] =
          source[index + 2] =
            Math.min(255, x);
        source[index + 3] = 255;
      }
    }
    expect(bleedChroma(source, width, height, 100)).toEqual(source);
  });

  it("creates deterministic pseudo-random sequences", () => {
    const first = mulberry32(1234);
    const second = mulberry32(1234);
    const a = Array.from({ length: 8 }, () => first());
    const b = Array.from({ length: 8 }, () => second());
    expect(a).toEqual(b);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
    expect(Array.from({ length: 8 }, () => mulberry32(99)())).toHaveLength(8);
  });

  it("hashes strings consistently and distinctly", () => {
    expect(hashString("lowquality")).toBe(hashString("lowquality"));
    expect(hashString("lowquality")).not.toBe(hashString("LowQuality"));
    expect(hashString("")).toBe(2166136261);
  });

  it("detects transparency", () => {
    expect(hasTransparency(rgba([255, 0, 0, 255]))).toBe(false);
    expect(hasTransparency(rgba([255, 0, 0, 254]))).toBe(true);
    expect(hasTransparency(rgba([255, 0, 0, 10]))).toBe(true);
  });

  it("adjusts contrast and saturation while preserving alpha", () => {
    const source = rgba([100, 150, 200, 77], [255, 0, 0, 255]);
    const neutral = adjustColor(source, 100, 100);
    expect(Array.from(neutral)).toEqual(Array.from(source));
    expect(neutral).not.toBe(source);

    const hot = adjustColor(source, 180, 200);
    expect(hot[0]).toBeLessThan(100);
    expect(hot[2]).toBeGreaterThan(200);
    expect(hot[3]).toBe(77);
    expect(hot[7]).toBe(255);
  });

  it("adds deterministic noise but leaves transparent pixels alone", () => {
    const source = rgba([100, 100, 100, 255], [9, 9, 9, 0], [200, 50, 25, 255]);
    const first = addNoise(source, 40, 123);
    const second = addNoise(source, 40, 123);
    const different = addNoise(source, 40, 456);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(Array.from(first)).not.toEqual(Array.from(different));
    expect(first[4]).toBe(9);
    expect(first[5]).toBe(9);
    expect(first[6]).toBe(9);
    expect(first[7]).toBe(0);
    expect(Array.from(addNoise(source, 0, 1))).toEqual(Array.from(source));
  });

  it("preserves the alpha channel exactly", () => {
    const target = rgba([1, 2, 3, 0], [4, 5, 6, 0]);
    const alpha = rgba([0, 0, 0, 17], [0, 0, 0, 230]);
    preserveAlpha(target, alpha);
    expect(target[3]).toBe(17);
    expect(target[7]).toBe(230);
    expect(target[0]).toBe(1);
  });

  it("applies a deterministic glitch and carries alpha through", () => {
    const width = 12;
    const height = 8;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      source[i * 4] = i % 255;
      source[i * 4 + 1] = (i * 3) % 255;
      source[i * 4 + 2] = (i * 7) % 255;
      source[i * 4 + 3] = i % 5 === 0 ? 0 : 255;
    }

    const first = applyGlitch(source, width, height, 70, 42);
    const second = applyGlitch(source, width, height, 70, 42);
    expect(Array.from(first)).toEqual(Array.from(second));
    for (let i = 3; i < source.length; i += 4) {
      if (source[i] === 0) expect(first[i]).toBe(0);
    }

    const off = applyGlitch(source, width, height, 0, 42);
    expect(Array.from(off)).toEqual(Array.from(source));
  });

  it("reduces the palette while keeping byte layout intact", () => {
    const source = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 256; i += 1) {
      source[i * 4] = (i * 17) % 256;
      source[i * 4 + 1] = (i * 43) % 256;
      source[i * 4 + 2] = (i * 91) % 256;
      source[i * 4 + 3] = 255;
    }
    const reduced = reduceColors(source, 4);
    expect(reduced).toHaveLength(source.length);
    const colors = new Set<string>();
    for (let i = 0; i < reduced.length; i += 4) {
      colors.add(`${reduced[i]},${reduced[i + 1]},${reduced[i + 2]}`);
    }
    expect(colors.size).toBeLessThanOrEqual(4);
    expect(Array.from(reduceColors(source, 256))).toEqual(Array.from(source));
  });

  it("sharpens edges and leaves tiny or disabled inputs alone", () => {
    const width = 5;
    const height = 3;
    const source = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i += 1) {
      const value = i % width === 0 ? 40 : 200;
      source[i * 4] = value;
      source[i * 4 + 1] = value;
      source[i * 4 + 2] = value;
      source[i * 4 + 3] = 255;
    }
    const sharpened = sharpenImage(source, width, height, 80);
    expect(Array.from(sharpened)).not.toEqual(Array.from(source));
    expect(Array.from(sharpenImage(source, width, height, 0))).toEqual(
      Array.from(source),
    );
    expect(Array.from(sharpenImage(source, 2, 2, 80))).toEqual(
      Array.from(source),
    );
  });
});
