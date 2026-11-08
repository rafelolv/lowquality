import { readFileSync } from "node:fs";
import { decompressFrames, parseGIF } from "gifuct-js";
import type { ParsedFrame, ParsedGif } from "gifuct-js";
import { describe, expect, it } from "vitest";
import {
  compositeGifFrames,
  decodeGifFrames,
  extractGifLoopCount,
  getGifBackground,
  normalizeGifDelay,
  prepareGifFrame,
} from "../../src/lib/gifCodec";

const danceBytes = new Uint8Array(
  readFileSync(new URL("../fixtures/dance.gif", import.meta.url)),
);

function makeFrame(
  pixels: number[][],
  dims: { left: number; top: number; width: number; height: number },
  disposalType: number,
  delay = 100,
): ParsedFrame {
  return {
    patch: new Uint8ClampedArray(pixels.flat()),
    dims,
    disposalType,
    delay,
    transparentIndex: undefined,
  } as unknown as ParsedFrame;
}

describe("GIF timing helpers", () => {
  it("normalises GIF delays into safe 10ms increments", () => {
    expect(normalizeGifDelay(0)).toBe(100);
    expect(normalizeGifDelay(Number.NaN)).toBe(100);
    expect(normalizeGifDelay(-30)).toBe(100);
    expect(normalizeGifDelay(5)).toBe(20);
    expect(normalizeGifDelay(24)).toBe(20);
    expect(normalizeGifDelay(27)).toBe(30);
    expect(normalizeGifDelay(200)).toBe(200);
  });

  it("reads loop metadata from both gifuct block representations", () => {
    const objectBlocks = {
      frames: [
        {
          application: {
            id: "NETSCAPE2.0",
            blocks: { 0: 1, 1: 0, 2: 0 },
          },
        },
      ],
    } as unknown as ParsedGif;
    expect(extractGifLoopCount(objectBlocks)).toBe(0);

    const arrayBlocks = {
      frames: [
        {
          application: {
            id: "ANIMEXTS1.0",
            blocks: [1, 3, 0],
          },
        },
      ],
    } as unknown as ParsedGif;
    expect(extractGifLoopCount(arrayBlocks)).toBe(3);

    const noLoop = { frames: [{ gce: {} }] } as unknown as ParsedGif;
    expect(extractGifLoopCount(noLoop)).toBe(-1);
  });

  it("extracts real loop and delay values from a fixture", () => {
    const buffer = Uint8Array.from(danceBytes).buffer;
    const parsed = parseGIF(buffer);
    const frames = decompressFrames(parsed, true);
    expect(frames).toHaveLength(6);
    expect(extractGifLoopCount(parsed)).toBe(0);
    expect(frames.map((frame) => normalizeGifDelay(frame.delay))).toEqual([
      80, 120, 160, 200, 240, 280,
    ]);
  });

  it("chooses transparent backgrounds only when a frame needs one", () => {
    const parsed = {
      gct: [
        [10, 20, 30],
        [40, 50, 60],
      ],
      lsd: { backgroundColorIndex: 1 },
    } as unknown as ParsedGif;

    expect(
      getGifBackground(parsed, [
        makeFrame(
          [[1, 2, 3, 255]],
          { left: 0, top: 0, width: 1, height: 1 },
          1,
        ),
      ]),
    ).toEqual({
      rgba: [40, 50, 60, 255],
      transparent: false,
    });

    const transparentFrame = makeFrame(
      [[1, 2, 3, 255]],
      { left: 0, top: 0, width: 1, height: 1 },
      1,
    );
    transparentFrame.transparentIndex = 0;
    expect(getGifBackground(parsed, [transparentFrame])).toEqual({
      rgba: [0, 0, 0, 0],
      transparent: true,
    });
  });

  it("composites full frames and respects disposal methods", () => {
    const red = [255, 0, 0, 255];
    const green = [0, 255, 0, 255];
    const blue = [0, 0, 255, 255];
    const transparent = [0, 0, 0, 0];

    const frames = [
      makeFrame(
        [red, red, red, red],
        { left: 0, top: 0, width: 2, height: 2 },
        1,
        80,
      ),
      makeFrame([green], { left: 1, top: 0, width: 1, height: 1 }, 2, 120),
      makeFrame([blue], { left: 0, top: 1, width: 1, height: 1 }, 1, 160),
    ];

    const output = Array.from(
      compositeGifFrames(frames, 2, 2, {
        rgba: transparent as [number, number, number, number],
        transparent: true,
      }),
    );
    expect(output.map((frame) => frame.delay)).toEqual([80, 120, 160]);
    expect(Array.from(output[0]?.pixels ?? [])).toEqual([
      ...red,
      ...red,
      ...red,
      ...red,
    ]);
    expect(Array.from(output[1]?.pixels ?? [])).toEqual([
      ...red,
      ...green,
      ...red,
      ...red,
    ]);
    expect(Array.from(output[2]?.pixels ?? [])).toEqual([
      ...red,
      ...transparent,
      ...blue,
      ...red,
    ]);
  });

  it("decodes patches lazily with the same disposal and pixels as bulk decoding", () => {
    const parsed = parseGIF(Uint8Array.from(danceBytes).buffer);
    const iterator = decodeGifFrames(parsed);
    expect(iterator[Symbol.iterator]()).toBe(iterator);
    const expected = decompressFrames(parsed, true);
    const actual = Array.from(iterator);
    expect(actual).toEqual(expected);
    const background = getGifBackground(parsed, expected);
    expect(
      Array.from(compositeGifFrames(actual.values(), 160, 120, background)),
    ).toEqual(Array.from(compositeGifFrames(expected, 160, 120, background)));
  });

  it("rejects oversized patches before decompressing their pixel arrays", () => {
    const parsed = parseGIF(Uint8Array.from(danceBytes).buffer);
    const frame = parsed.frames.find((entry) => "image" in entry);
    if (!frame || !("image" in frame)) throw new Error("Missing fixture frame");
    frame.image.descriptor.width = 65535;
    frame.image.descriptor.height = 65535;
    expect(() => Array.from(decodeGifFrames(parsed))).toThrow(
      /source-frame limit/,
    );
  });

  it("prepares an indexed frame with a guaranteed transparent slot", () => {
    const pixels = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i += 1) {
      pixels[i * 4] = i * 9;
      pixels[i * 4 + 1] = i * 5;
      pixels[i * 4 + 2] = i * 3;
      pixels[i * 4 + 3] = i === 0 ? 0 : 255;
    }
    const prepared = prepareGifFrame(pixels, 16, 16);
    expect(prepared.transparent).toBe(true);
    expect(prepared.transparentIndex).toBeGreaterThanOrEqual(0);
    expect(prepared.indices).toHaveLength(16 * 16);
    expect(prepared.indices[0]).toBe(prepared.transparentIndex);
    expect(prepared.palette.length).toBeLessThanOrEqual(256);
  });
});
