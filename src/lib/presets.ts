import type {
  DegradationSettings,
  EnabledEffects,
  PresetId,
  PresetProfile,
  SettingsOverrides,
} from "../types";
import { EFFECT_KEYS } from "../types";

export const NEUTRAL_SETTINGS: DegradationSettings = {
  jpegQuality: 100,
  resolution: 100,
  pixelSize: 1,
  compressionPasses: 0,
  noise: 0,
  colorCount: 256,
  contrast: 100,
  saturation: 100,
  sharpen: 0,
  glitch: 0,
};

export const DEFAULT_ENABLED_EFFECTS: EnabledEffects = {
  jpeg: true,
  resolution: true,
  pixelate: true,
  compressionLoops: true,
  noise: true,
  colors: true,
  contrast: true,
  saturation: true,
  sharpen: true,
  glitch: true,
};

const neutralCharacter: PresetProfile["character"] = {
  jpegFactor: 1,
  resolutionFactor: 1,
  pixelFactor: 1,
  passBonus: 0,
  noiseFactor: 1,
  colorFactor: 1,
  contrastDelta: 0,
  saturationDelta: 0,
  sharpenFactor: 1,
  glitchFactor: 1,
};

export const PRESETS: PresetProfile[] = [
  {
    id: "original",
    name: "Original",
    description: "Hands off. For now.",
    defaultQuality: 0,
    character: neutralCharacter,
  },
  {
    id: "slightly-cursed",
    name: "Slightly Cursed",
    description: "A little off.",
    defaultQuality: 25,
    character: {
      ...neutralCharacter,
      jpegFactor: 0.9,
      resolutionFactor: 1.06,
      pixelFactor: 0.35,
      noiseFactor: 0.6,
      colorFactor: 1.06,
      saturationDelta: 0.04,
      sharpenFactor: 0.3,
      glitchFactor: 0.1,
    },
  },
  {
    id: "crunchy-jpeg",
    name: "Crunchy JPEG",
    description: "Extra artifacts.",
    defaultQuality: 55,
    character: {
      ...neutralCharacter,
      jpegFactor: 0.55,
      resolutionFactor: 1.16,
      pixelFactor: 0.12,
      passBonus: 2,
      noiseFactor: 0.6,
      colorFactor: 1,
      contrastDelta: 0.02,
      saturationDelta: 0.05,
      sharpenFactor: 0.55,
      glitchFactor: 0.25,
    },
  },
  {
    id: "pixel-disaster",
    name: "Pixel Disaster",
    description: "Chunky by design.",
    defaultQuality: 66,
    character: {
      ...neutralCharacter,
      jpegFactor: 2,
      resolutionFactor: 0.8,
      pixelFactor: 2.2,
      noiseFactor: 0.2,
      colorFactor: 0.65,
      contrastDelta: 0.08,
      saturationDelta: 0.15,
      sharpenFactor: 0.3,
      glitchFactor: 0.2,
    },
  },
  {
    id: "deep-fried",
    name: "Deep Fried",
    description: "Maximum seasoning.",
    defaultQuality: 82,
    character: {
      ...neutralCharacter,
      jpegFactor: 0.45,
      resolutionFactor: 1.25,
      pixelFactor: 0.5,
      passBonus: 1,
      noiseFactor: 1.5,
      colorFactor: 0.8,
      contrastDelta: 0.3,
      saturationDelta: 0.9,
      sharpenFactor: 1.5,
      glitchFactor: 0.9,
    },
  },
  {
    id: "absolute-garbage",
    name: "Absolute Garbage",
    description: "No survivors.",
    defaultQuality: 100,
    character: {
      ...neutralCharacter,
      jpegFactor: 0.35,
      resolutionFactor: 0.75,
      pixelFactor: 1.8,
      passBonus: 3,
      noiseFactor: 1.3,
      colorFactor: 1,
      contrastDelta: 0.4,
      saturationDelta: 1.2,
      sharpenFactor: 1.2,
      glitchFactor: 1.3,
    },
  },
];

const customPreset: PresetProfile = {
  id: "custom",
  name: "Custom Mix",
  description: "Your own bad idea.",
  defaultQuality: 55,
  character: neutralCharacter,
};

export const INITIAL_PRESET_ID: PresetId = "crunchy-jpeg";
export const INITIAL_PRESET = PRESETS.find(
  (preset) => preset.id === INITIAL_PRESET_ID,
)!;
export const INITIAL_QUALITY = INITIAL_PRESET.defaultQuality;

export function getPreset(id: PresetId): PresetProfile {
  return PRESETS.find((preset) => preset.id === id) ?? customPreset;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value);

/**
 * Default damage resembles an image reposted too many times: JPEG ringing,
 * colour bleed, smearing and generation loss. Nearest-neighbour pixelation is
 * opt-in through Pixel Disaster or a manual override, independent of HOW BAD?.
 */
export function getAutoSettings(
  quality: number,
  presetId: PresetId,
): DegradationSettings {
  if (quality <= 0) {
    return { ...NEUTRAL_SETTINGS };
  }

  const t = clamp(quality, 0, 100) / 100;
  const preset = getPreset(presetId);
  const character = preset.character;

  const base: DegradationSettings = {
    jpegQuality: round(100 - 99 * Math.pow(t, 0.65)),
    resolution: round(100 - 42 * Math.pow(t, 1.35)),
    pixelSize:
      presetId === "pixel-disaster" ? round(1 + 41 * Math.pow(t, 2.3)) : 1,
    compressionPasses: round(8 * Math.pow(t, 1.4)),
    noise: round(18 * Math.pow(t, 2.2)),
    colorCount:
      presetId === "pixel-disaster"
        ? round(256 - 192 * Math.pow(t, 1.35))
        : 256,
    contrast: round(100 + 22 * Math.pow(t, 2.2)),
    saturation: round(100 + 35 * Math.pow(t, 1.9)),
    sharpen: round(35 * Math.pow(t, 2.5)),
    glitch: round(8 * Math.pow(t, 3.3)),
  };

  return {
    jpegQuality: clamp(round(base.jpegQuality * character.jpegFactor), 1, 100),
    resolution: clamp(
      round(base.resolution * character.resolutionFactor),
      4,
      100,
    ),
    pixelSize: clamp(
      round(1 + (base.pixelSize - 1) * character.pixelFactor),
      1,
      96,
    ),
    compressionPasses: clamp(
      base.compressionPasses + character.passBonus,
      0,
      9,
    ),
    noise: clamp(round(base.noise * character.noiseFactor), 0, 100),
    colorCount: clamp(round(base.colorCount * character.colorFactor), 2, 256),
    contrast: clamp(
      round(base.contrast + character.contrastDelta * 100),
      100,
      280,
    ),
    saturation: clamp(
      round(base.saturation + character.saturationDelta * 100),
      0,
      350,
    ),
    sharpen: clamp(round(base.sharpen * character.sharpenFactor), 0, 100),
    glitch: clamp(round(base.glitch * character.glitchFactor), 0, 100),
  };
}

export function resolveSettings(
  quality: number,
  presetId: PresetId,
  overrides: SettingsOverrides,
): DegradationSettings {
  return { ...getAutoSettings(quality, presetId), ...overrides };
}

export function resolveEnabled(
  disabledEffects: ReadonlySet<string>,
): EnabledEffects {
  return EFFECT_KEYS.reduce<EnabledEffects>(
    (result, key) => {
      result[key] = !disabledEffects.has(key);
      return result;
    },
    { ...DEFAULT_ENABLED_EFFECTS },
  );
}

export function countOverrides(overrides: SettingsOverrides): number {
  return Object.keys(overrides).length;
}

export function qualityDescriptor(quality: number): string {
  if (quality <= 0) return "Original";
  if (quality < 20) return "Barely cursed";
  if (quality < 40) return "Slightly cursed";
  if (quality < 60) return "Bad quality";
  if (quality < 80) return "Very bad";
  if (quality < 95) return "Deep fried";
  return "Absolute garbage";
}

export const QUALITY_TICKS = [
  { value: 0, label: "Original" },
  { value: 20, label: "Cursed" },
  { value: 40, label: "Bad" },
  { value: 60, label: "Very bad" },
  { value: 80, label: "Fried" },
  { value: 100, label: "Garbage" },
];

export function isNeutral(settings: DegradationSettings): boolean {
  return (
    settings.jpegQuality >= 100 &&
    settings.resolution >= 100 &&
    settings.pixelSize <= 1 &&
    settings.noise <= 0 &&
    settings.colorCount >= 256 &&
    settings.contrast === 100 &&
    settings.saturation === 100 &&
    settings.sharpen <= 0 &&
    settings.glitch <= 0
  );
}
