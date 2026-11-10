export type EffectKey =
  | 'jpeg'
  | 'resolution'
  | 'pixelate'
  | 'compressionLoops'
  | 'noise'
  | 'colors'
  | 'contrast'
  | 'saturation'
  | 'sharpen'
  | 'glitch';

export const EFFECT_KEYS: EffectKey[] = [
  'jpeg',
  'resolution',
  'pixelate',
  'compressionLoops',
  'noise',
  'colors',
  'contrast',
  'saturation',
  'sharpen',
  'glitch',
];

export interface DegradationSettings {
  /** JPEG quality from 1 (very bad) to 100 (untouched). */
  jpegQuality: number;
  /** Percentage of the working resolution that remains after downscaling. */
  resolution: number;
  /** Block size relative to a 1000px-wide image. 1 means no pixelation. */
  pixelSize: number;
  /** Extra encode/decode passes after the initial JPEG round trip. */
  compressionPasses: number;
  /** 0-100 monochrome/colour sensor noise. */
  noise: number;
  /** Number of colours left in the palette. 256 means no reduction. */
  colorCount: number;
  /** Percentage, where 100 is neutral. */
  contrast: number;
  /** Percentage, where 100 is neutral. */
  saturation: number;
  /** Unsharp-mask amount, 0-100. */
  sharpen: number;
  /** Horizontal tears and chromatic misalignment, 0-100. */
  glitch: number;
}

export type EnabledEffects = Record<EffectKey, boolean>;

export type SettingsOverrides = Partial<DegradationSettings>;

export type PresetId =
  | 'original'
  | 'slightly-cursed'
  | 'crunchy-jpeg'
  | 'pixel-disaster'
  | 'deep-fried'
  | 'absolute-garbage'
  | 'custom';

export interface PresetProfile {
  id: PresetId;
  name: string;
  description: string;
  defaultQuality: number;
  /** Multipliers and offsets applied to the automatic quality curve. */
  character: {
    jpegFactor: number;
    resolutionFactor: number;
    pixelFactor: number;
    passBonus: number;
    noiseFactor: number;
    colorFactor: number;
    contrastDelta: number;
    saturationDelta: number;
    sharpenFactor: number;
    glitchFactor: number;
  };
}

export type TextFontId = 'anton' | 'press' | 'grotesk';
export type TextAlign = 'left' | 'center' | 'right';

export interface TextLayer {
  id: string;
  text: string;
  fontId: TextFontId;
  /** Font size as a percentage of the image's shortest side. */
  size: number;
  color: string;
  outline: boolean;
  outlineColor: string;
  /** Outline width as a percentage of the font size. */
  outlineWidth: number;
  align: TextAlign;
  /** Normalised centre position (0-1). */
  x: number;
  y: number;
  visible: boolean;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextOverlay {
  revision: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageFileMeta {
  name: string;
  type: string;
  size: number;
  format: string;
}

export interface StaticSession extends ImageFileMeta {
  kind: 'static';
  width: number;
  height: number;
  hasAlpha: boolean;
  originalBitmap: ImageBitmap;
  sessionId: string;
}

export interface GifSession extends ImageFileMeta {
  kind: 'gif';
  /** Working dimensions. May be scaled down for very large animations. */
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  frameCount: number;
  durationMs: number;
  delays: number[];
  loopCount: number;
  wasScaled: boolean;
  originalUrl: string;
  sessionId: string;
}

export type ImageSession = StaticSession | GifSession;

export interface PreviewFrame {
  bitmap: ImageBitmap;
  delay: number;
}

export interface PreviewResult {
  kind: 'static' | 'gif';
  width: number;
  height: number;
  frames: PreviewFrame[];
  revision: number;
}

export type ViewMode = 'original' | 'result' | 'compare';
export type ExportFormat = 'png' | 'jpeg' | 'webp' | 'gif';
export type CompressFormat = 'jpeg' | 'webp';
export type ToolMode = 'convert' | 'compress';

export interface NoticeMessage {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

export type WorkerErrorCode =
  | 'unsupported'
  | 'decode-failed'
  | 'too-large'
  | 'cancelled'
  | 'no-source'
  | 'overlay-missing'
  | 'processing-failed';

export interface ProcessContext {
  settings: DegradationSettings;
  enabled: EnabledEffects;
  overlayId: string;
}

export interface OverlayBuffer {
  id: string;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

export interface GifDecodeMeta {
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  frameCount: number;
  durationMs: number;
  delays: number[];
  loopCount: number;
  wasScaled: boolean;
}

export interface GifPreflight {
  width: number;
  height: number;
  frameCount: number;
  totalPixels: number;
}
