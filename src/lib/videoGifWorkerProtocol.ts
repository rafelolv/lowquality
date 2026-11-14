export interface VideoGifStart {
  type: "start";
  width: number;
  height: number;
  delay: number;
  delays: number[];
  repeat: number;
  frameCount: number;
  reverse: boolean;
  colors: number;
}

export interface VideoGifFrame {
  type: "frame";
  /** RGBA pixels, width * height * 4 bytes. */
  pixels: ArrayBuffer;
}

export type VideoGifCommand =
  | VideoGifStart
  | VideoGifFrame
  | { type: "finish" };

export type VideoGifEvent =
  | { type: "progress"; encoded: number }
  | { type: "done"; bytes: ArrayBuffer }
  | { type: "error"; message: string };
