import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENABLED_EFFECTS,
  INITIAL_PRESET_ID,
  INITIAL_QUALITY,
  NEUTRAL_SETTINGS,
  PRESETS,
  countOverrides,
  getAutoSettings,
  getPreset,
  isNeutral,
  qualityDescriptor,
  resolveEnabled,
  resolveSettings,
} from "../../src/lib/presets";
import type { PresetId } from "../../src/types";

const QUALITY_STEPS = [0, 10, 25, 50, 75, 90, 100];
const PRESET_IDS: PresetId[] = [
  "original",
  "slightly-cursed",
  "crunchy-jpeg",
  "pixel-disaster",
  "deep-fried",
  "absolute-garbage",
];

describe("presets", () => {
  it("exposes six named presets with sensible defaults", () => {
    expect(PRESETS).toHaveLength(6);
    expect(PRESETS.map((preset) => preset.id)).toEqual(PRESET_IDS);
    expect(getPreset(INITIAL_PRESET_ID).name).toBe("Crunchy JPEG");
    expect(INITIAL_QUALITY).toBe(55);
    expect(getPreset("custom").name).toBe("Custom Mix");
  });

  it("returns completely neutral settings at quality zero", () => {
    for (const id of PRESET_IDS) {
      expect(getAutoSettings(0, id)).toEqual(NEUTRAL_SETTINGS);
    }
    expect(getAutoSettings(-20, "deep-fried")).toEqual(NEUTRAL_SETTINGS);
    expect(isNeutral(NEUTRAL_SETTINGS)).toBe(true);
  });

  it("pushes every destructive value in the worsening direction", () => {
    for (const id of PRESET_IDS) {
      let previous = getAutoSettings(0, id);
      for (const quality of QUALITY_STEPS.slice(1)) {
        const current = getAutoSettings(quality, id);
        expect(current.jpegQuality).toBeLessThanOrEqual(previous.jpegQuality);
        expect(current.resolution).toBeLessThanOrEqual(previous.resolution);
        expect(current.pixelSize).toBeGreaterThanOrEqual(previous.pixelSize);
        expect(current.compressionPasses).toBeGreaterThanOrEqual(
          previous.compressionPasses,
        );
        expect(current.noise).toBeGreaterThanOrEqual(previous.noise);
        expect(current.colorCount).toBeLessThanOrEqual(previous.colorCount);
        expect(current.contrast).toBeGreaterThanOrEqual(previous.contrast);
        expect(current.saturation).toBeGreaterThanOrEqual(previous.saturation);
        expect(current.sharpen).toBeGreaterThanOrEqual(previous.sharpen);
        expect(current.glitch).toBeGreaterThanOrEqual(previous.glitch);
        previous = current;
      }
    }
  });

  it("produces clearly different settings for different presets at the same level", () => {
    const crunchy = getAutoSettings(55, "crunchy-jpeg");
    const pixel = getAutoSettings(55, "pixel-disaster");
    const fried = getAutoSettings(55, "deep-fried");

    expect(crunchy.jpegQuality).toBeLessThan(pixel.jpegQuality);
    expect(pixel.pixelSize).toBeGreaterThan(crunchy.pixelSize);
    expect(fried.saturation).toBeGreaterThan(pixel.saturation);
  });

  it("keeps advanced overrides on top of the automatic curve", () => {
    const base = getAutoSettings(60, "pixel-disaster");
    const resolved = resolveSettings(60, "pixel-disaster", {
      jpegQuality: 12,
      noise: 0,
    });
    expect(resolved).toEqual({ ...base, jpegQuality: 12, noise: 0 });
    expect(countOverrides({ jpegQuality: 12, noise: 0 })).toBe(2);
    expect(countOverrides({})).toBe(0);

    const next = resolveSettings(20, "pixel-disaster", { jpegQuality: 12 });
    expect(next.jpegQuality).toBe(12);
    expect(next.noise).toBe(getAutoSettings(20, "pixel-disaster").noise);
  });

  it("never adds automatic pixel blocks outside the explicit Pixel Disaster preset", () => {
    for (const id of [...PRESET_IDS, "custom"] as PresetId[]) {
      if (id === "pixel-disaster") continue;
      for (let quality = 0; quality <= 100; quality += 1) {
        expect(
          getAutoSettings(quality, id).pixelSize,
          `${id} at ${quality}`,
        ).toBe(1);
      }
    }
    expect(getAutoSettings(100, "pixel-disaster").pixelSize).toBeGreaterThan(
      40,
    );
    expect(
      resolveSettings(100, "crunchy-jpeg", { pixelSize: 25 }).pixelSize,
    ).toBe(25);
  });

  it("keeps recognizable image structure while increasing JPEG generation loss", () => {
    const worst = getAutoSettings(100, "crunchy-jpeg");
    expect(worst.jpegQuality).toBeLessThanOrEqual(2);
    expect(worst.compressionPasses).toBeGreaterThanOrEqual(8);
    expect(worst.resolution).toBeGreaterThanOrEqual(60);
    expect(worst.colorCount).toBeGreaterThanOrEqual(48);
    expect(worst.noise).toBeLessThan(25);
    expect(worst.glitch).toBeLessThan(10);
  });

  it("resolves effect toggles and descriptors", () => {
    expect(resolveEnabled(new Set())).toEqual(DEFAULT_ENABLED_EFFECTS);
    expect(resolveEnabled(new Set(["jpeg", "noise"]))).toMatchObject({
      jpeg: false,
      noise: false,
      glitch: true,
    });

    expect(qualityDescriptor(0)).toBe("Original");
    expect(qualityDescriptor(1)).toBe("Barely cursed");
    expect(qualityDescriptor(30)).toBe("Slightly cursed");
    expect(qualityDescriptor(55)).toBe("Bad quality");
    expect(qualityDescriptor(70)).toBe("Very bad");
    expect(qualityDescriptor(85)).toBe("Deep fried");
    expect(qualityDescriptor(100)).toBe("Absolute garbage");
  });
});
