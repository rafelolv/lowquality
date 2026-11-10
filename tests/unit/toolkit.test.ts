import { describe, it, expect } from "vitest";
import {
  clampCrop,
  fitSize,
  SOCIAL_PRESETS,
  FAVICON_SIZES,
  gifDelay,
} from "../../src/lib/toolkit/geometry";
import { uniqueNames, zip, crc32 } from "../../src/lib/toolkit/zip";
describe("toolkit math and archives", () => {
  it("fits without upscaling, rounds safely", () => {
    expect(fitSize(1600, 900, 800)).toEqual({ width: 800, height: 450 });
    expect(fitSize(16, 9, 800)).toEqual({ width: 16, height: 9 });
  });
  it("clamps crop within source", () => {
    expect(
      clampCrop({ x: -9, y: 100, width: 200, height: 20 }, 100, 80),
    ).toEqual({ x: 0, y: 60, width: 100, height: 20 });
  });
  it("includes exact social and icon sizes", () => {
    expect(SOCIAL_PRESETS).toEqual([
      ["Custom", 0, 0],
      ["Instagram", 1080, 1080],
      ["Portrait", 1080, 1350],
      ["Story / Reel", 1080, 1920],
      ["YouTube", 1280, 720],
      ["X", 1600, 900],
      ["LinkedIn", 1200, 627],
    ]);
    expect(FAVICON_SIZES).toEqual([16, 32, 48, 180, 192, 512]);
  });
  it("sanitizes paths, deduplicates case-insensitively", () => {
    expect(uniqueNames(["../a.png", "a.png", "A.png", "a-2.png"])).toEqual([
      "a.png",
      "a-2.png",
      "A-3.png",
      "a-2-2.png",
    ]);
  });
  it("writes a store-only ZIP with correct CRC and central directory", async () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const bytes = new DataView(
      await (
        await zip([{ name: "a.txt", blob: new Blob(["hello"]) }])
      ).arrayBuffer(),
    );
    expect(bytes.getUint32(0, true)).toBe(0x04034b50);
    expect(bytes.getUint16(bytes.byteLength - 14, true)).toBe(1);
    expect(bytes.getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50);
  });
  it("scales GIF delays with safe centisecond precision", () => {
    expect(gifDelay(100, 2)).toBe(50);
    expect(gifDelay(100, 0.5)).toBe(200);
    expect(gifDelay(20, 2)).toBe(20);
  });
});

import { readMetadata } from "../../src/lib/toolkit/metadata";
import { makeIco } from "../../src/lib/toolkit/icons";
import { readFileSync } from "node:fs";
it("reads camera, orientation, date and GPS from bounded EXIF fixture", () => {
  const file = readFileSync("tests/fixtures/exif-gps.png");
  const metadata = readMetadata(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  );
  expect(metadata["Camera make"]).toBe("Canon");
  expect(metadata.Orientation).toBe("6");
  expect(metadata["GPS latitude"]).toBe("-23.55");
  expect(Number(metadata["GPS longitude"])).toBeCloseTo(-46.6333333);
  expect(readMetadata(new ArrayBuffer(5))).toEqual({});
  expect(
    readMetadata(new Uint8Array([255, 216, 255, 225, 255, 255, 0, 0]).buffer),
  ).toEqual({});
});
it("builds an ICO with correct image offsets", async () => {
  const icon = await makeIco(
    [16, 32, 48].map((size) => ({
      size,
      blob: new Blob([new Uint8Array(10)]),
    })),
  );
  const view = new DataView(await icon.arrayBuffer());
  expect(view.getUint16(2, true)).toBe(1);
  expect(view.getUint16(4, true)).toBe(3);
  expect(view.getUint32(18, true)).toBe(54);
  expect(view.getUint32(34, true)).toBe(64);
});

import { searchCompression } from "../../src/lib/toolkit/compressSearch";
import { squareCrop, aspectCrop } from "../../src/lib/toolkit/geometry";
it("builds centered square crops and constrains aspect ratio", () => {
  expect(squareCrop(200, 100)).toEqual({
    x: 50,
    y: 0,
    width: 100,
    height: 100,
  });
  expect(
    aspectCrop({ x: 0, y: 0, width: 100, height: 100 }, 100, 100, 2),
  ).toEqual({ x: 0, y: 0, width: 100, height: 50 });
});
it("searches quality before reducing resolution, never crosses the floor", async () => {
  const attempts: { scale: number; quality: number }[] = [];
  const result = await searchCompression(
    1000,
    500,
    { targetBytes: 600, qualityFloor: 0.6, maxDimension: 0 },
    async (scale, quality) => {
      attempts.push({ scale, quality });
      return {
        blob: new Blob([
          new Uint8Array(Math.round(scale * scale * quality * 1000)),
        ]),
        width: Math.round(1000 * scale),
        height: Math.round(500 * scale),
        quality,
      };
    },
  );
  expect(attempts.slice(0, 2)).toEqual([
    { scale: 1, quality: 0.82 },
    { scale: 1, quality: 0.6 },
  ]);
  expect(attempts.every((attempt) => attempt.quality >= 0.6)).toBe(true);
  expect(result.width).toBe(1000);
  expect(result.hitTarget).toBe(true);
  expect(result.blob.size).toBeLessThanOrEqual(600);
});
it("reports unreachable compression targets honestly", async () => {
  const result = await searchCompression(
    10,
    10,
    { targetBytes: 64, qualityFloor: 0.8, maxDimension: 0 },
    async (_scale, quality) => ({
      blob: new Blob([new Uint8Array(100)]),
      width: 10,
      height: 10,
      quality,
    }),
  );
  expect(result.hitTarget).toBe(false);
  expect(result.blob.size).toBe(100);
});
