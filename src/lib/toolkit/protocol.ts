import type { Rect } from "./geometry";
export type Tool =
  | "resize"
  | "batch"
  | "metadata"
  | "favicon"
  | "redact"
  | "gif"
  | "video";
export type Format = "png" | "jpeg" | "webp";
export interface Options {
  tool: Tool;
  format: Format;
  quality: number;
  width: number;
  height: number;
  fit: "contain" | "cover";
  crop?: Rect;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  targetBytes: number;
  maxDimension: number;
  qualityFloor: number;
  regions: Rect[];
  mode: "pixelate" | "blur";
  strength: number;
  padding: boolean;
  background: string;
  reverse: boolean;
  speed: number;
  colors: number;
  extract: boolean;
}
export const defaults: Options = {
  tool: "resize",
  format: "png",
  quality: 0.9,
  width: 0,
  height: 0,
  fit: "contain",
  rotation: 0,
  flipX: false,
  flipY: false,
  targetBytes: 0,
  maxDimension: 0,
  qualityFloor: 0.6,
  regions: [],
  mode: "pixelate",
  strength: 24,
  padding: true,
  background: "#ffffff",
  reverse: false,
  speed: 1,
  colors: 256,
  extract: false,
};
export interface Result {
  blob: Blob;
  name: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  metadata?: Record<string, string>;
  icons?: { size: number; blob: Blob }[];
  frames?: { delay: number; blob: Blob }[];
  loop?: number;
  hitTarget?: boolean;
}
export interface Request {
  bitmap?: ImageBitmap;
  file?: File;
  files?: { name: string; blob: Blob }[];
  options: Options;
  inspect?: boolean;
}
