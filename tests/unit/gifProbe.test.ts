import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { probeGif } from "../../src/lib/gifProbe";
import {
  MAX_GIF_DIMENSION,
  MAX_GIF_TOTAL_PIXELS,
  fitScaleOptions,
  requiredGifLoadScale,
} from "../../src/lib/constants";

const danceBytes = new Uint8Array(
  readFileSync(new URL("../fixtures/dance.gif", import.meta.url)),
);
const largeBytes = new Uint8Array(
  readFileSync(new URL("../fixtures/large-parade.gif", import.meta.url)),
);

describe("GIF preflight", () => {
  it("walks the block structure without decoding pixels", () => {
    expect(probeGif(Uint8Array.from(danceBytes).buffer)).toEqual({
      width: 160,
      height: 120,
      frameCount: 6,
      totalPixels: 160 * 120 * 6,
    });
    expect(probeGif(Uint8Array.from(largeBytes).buffer)).toMatchObject({
      width: 2000,
      height: 1000,
      frameCount: 3,
    });
  });

  it("rejects excessive source dimensions before offering misleading scaling", () => {
    const bytes = Uint8Array.from(danceBytes);
    bytes[6] = 0xff;
    bytes[7] = 0xff;
    bytes[8] = 0xff;
    bytes[9] = 0xff;
    expect(() => probeGif(bytes.buffer)).toThrow(
      /8 megapixel source-frame limit/,
    );
  });

  it("rejects nonsense and empty GIFs", () => {
    expect(() => probeGif(new Uint8Array(4).buffer)).toThrow(/too short/i);
    expect(() =>
      probeGif(new TextEncoder().encode("definitely not a gif, sorry").buffer),
    ).toThrow(/not a valid GIF/i);
    const noFrames = Uint8Array.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b, 0, 0, 0, 0,
      0, 0, 0,
    ]);
    expect(() => probeGif(noFrames.buffer)).toThrow(/does not contain/i);
  });
});

describe("GIF safety scaling", () => {
  it("keeps safe GIFs at full size", () => {
    expect(requiredGifLoadScale(800, 600, 10)).toBe(1);
    expect(requiredGifLoadScale(MAX_GIF_DIMENSION, MAX_GIF_DIMENSION, 1)).toBe(
      1,
    );
  });

  it("scales down oversized dimensions and pixel budgets", () => {
    expect(requiredGifLoadScale(4000, 4000, 3)).toBeCloseTo(0.4, 5);
    expect(requiredGifLoadScale(2000, 1000, 3)).toBeCloseTo(0.8, 5);
    expect(requiredGifLoadScale(1600, 1600, 240)).toBeCloseTo(
      Math.sqrt(MAX_GIF_TOTAL_PIXELS / (1600 * 1600 * 240)),
      5,
    );
  });

  it("offers only safe scale choices in descending order", () => {
    expect(fitScaleOptions(1)).toEqual([0.75, 0.5, 0.25, 0.1]);
    expect(fitScaleOptions(0.8)).toEqual([0.8, 0.75, 0.5, 0.25, 0.1]);
    expect(fitScaleOptions(0.62)).toEqual([0.62, 0.5, 0.25, 0.1]);
    expect(fitScaleOptions(0.01)).toEqual([0.02]);
  });
});
