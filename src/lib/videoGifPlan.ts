/**
 * Pure planning and format rules for the Video to GIF tool.
 *
 * Browsers decode MP4, WebM, M4V and MOV through the native video element.
 * AVI, WMV and MPEG usually need a desktop transcoder, so we reject them with
 * a clear explanation instead of pretending the browser can read them.
 */

export const MAX_VIDEO_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_VIDEO_GIF_FRAMES = 240;
export const MAX_VIDEO_GIF_DIMENSION = 800;
export const MAX_VIDEO_GIF_TOTAL_PIXELS = 24_000_000;
export const MAX_VIDEO_GIF_SECONDS = 60;

const DECODABLE_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "m4v", "mov"]);
const BROWSER_ONLY_VIDEO_EXTENSIONS = new Set(["avi", "wmv", "mpeg", "mpg"]);

const VIDEO_LABELS: Record<string, string> = {
  mp4: "MP4",
  webm: "WEBM",
  m4v: "M4V",
  mov: "MOV",
  avi: "AVI",
  wmv: "WMV",
  mpeg: "MPEG",
  mpg: "MPEG",
};

const DECODABLE_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

export const VIDEO_ACCEPT =
  "video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.m4v,.mov,.avi,.wmv,.mpeg,.mpg";

export interface VideoFormatInfo {
  supported: boolean;
  label: string;
  reason?: string;
}

export function detectVideoFormat(file: File): VideoFormatInfo {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const label = VIDEO_LABELS[extension];
  if (label && DECODABLE_VIDEO_EXTENSIONS.has(extension)) {
    return { supported: true, label };
  }
  if (label && BROWSER_ONLY_VIDEO_EXTENSIONS.has(extension)) {
    return {
      supported: false,
      label,
      reason:
        "AVI, WMV and MPEG need a desktop transcoder. This browser-only tool accepts MP4, WEBM, M4V and MOV.",
    };
  }
  if (DECODABLE_VIDEO_MIME.has(file.type)) {
    return {
      supported: true,
      label: label ?? file.type.replace(/^video\//, "").toUpperCase(),
    };
  }
  return {
    supported: false,
    label: label ?? "Unknown",
    reason:
      "Choose an MP4, WEBM, M4V or MOV video. AVI, WMV and MPEG need a desktop transcoder.",
  };
}

export interface VideoGifPlanInput {
  start: number;
  end: number;
  fps: number;
  colors: number;
  speed: number;
  width: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface VideoGifPlan {
  width: number;
  height: number;
  frameCount: number;
  /** Delay per frame in milliseconds, already adjusted for playback speed. */
  delay: number;
  delays: number[];
  /** Approximate playback duration of the encoded GIF, in seconds. */
  duration: number;
  start: number;
  fps: number;
  colors: number;
  speed: number;
}

export function planVideoGif(input: VideoGifPlanInput): VideoGifPlan {
  const values = [
    input.start,
    input.end,
    input.fps,
    input.colors,
    input.speed,
    input.width,
    input.sourceWidth,
    input.sourceHeight,
  ];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error("The video settings include an invalid number.");
  }
  if (input.sourceWidth < 1 || input.sourceHeight < 1) {
    throw new Error("This browser did not report usable video dimensions.");
  }
  if (input.start < 0) {
    throw new Error("Clip start must be zero or greater.");
  }
  if (input.end <= input.start) {
    throw new Error("Set an end point after the start point.");
  }
  if (input.fps < 1 || input.fps > 30) {
    throw new Error("Frame rate must stay between 1 and 30 FPS.");
  }
  if (input.speed <= 0) {
    throw new Error("Playback speed must be greater than zero.");
  }
  const clipSeconds = input.end - input.start;
  if (clipSeconds + 1e-6 < 0.1) {
    throw new Error("Clips must be at least 0.1 seconds long.");
  }
  if (clipSeconds > MAX_VIDEO_GIF_SECONDS + 0.001) {
    throw new Error(
      `GIF clips are capped at ${MAX_VIDEO_GIF_SECONDS} seconds. Shorten the trim.`,
    );
  }

  const frameCount = Math.max(1, Math.round(clipSeconds * input.fps));
  if (frameCount > MAX_VIDEO_GIF_FRAMES) {
    throw new Error(
      `This trim would use ${frameCount} frames. The safe limit is ${MAX_VIDEO_GIF_FRAMES}; lower the FPS or shorten the clip.`,
    );
  }

  let width = Math.round(Math.min(Math.max(1, input.width), input.sourceWidth));
  if (width > MAX_VIDEO_GIF_DIMENSION) width = MAX_VIDEO_GIF_DIMENSION;
  let height = Math.max(
    1,
    Math.round((width * input.sourceHeight) / input.sourceWidth),
  );
  if (height > MAX_VIDEO_GIF_DIMENSION) {
    width = Math.max(1, Math.round((width * MAX_VIDEO_GIF_DIMENSION) / height));
    height = MAX_VIDEO_GIF_DIMENSION;
  }

  const totalPixels = width * height * frameCount;
  if (totalPixels > MAX_VIDEO_GIF_TOTAL_PIXELS) {
    throw new Error(
      `This GIF would decode ${(totalPixels / 1_000_000).toFixed(1)} million pixels. Reduce the width, FPS or clip length.`,
    );
  }

  const delay = Math.max(
    20,
    Math.round(1000 / input.fps / input.speed / 10) * 10,
  );

  const frameDuration = Math.max(20, 1000 / input.fps / input.speed);
  const delays = Array.from(
    { length: frameCount },
    (_, index) =>
      (Math.round(((index + 1) * frameDuration) / 10) -
        Math.round((index * frameDuration) / 10)) *
      10,
  );
  return {
    width,
    height,
    frameCount,
    delay,
    delays,
    duration: delays.reduce((total, value) => total + value, 0) / 1000,
    start: input.start,
    fps: input.fps,
    colors: Math.max(2, Math.min(256, Math.round(input.colors))),
    speed: input.speed,
  };
}

export const VIDEO_GIF_PRESETS = [
  { id: "small", label: "Smaller file", fps: 8, width: 320, colors: 64 },
  { id: "balanced", label: "Balanced", fps: 12, width: 480, colors: 128 },
  { id: "smooth", label: "Smoother motion", fps: 20, width: 640, colors: 256 },
] as const;
export type VideoGifPreset = (typeof VIDEO_GIF_PRESETS)[number]["id"];

export function videoGifPreset(
  id: VideoGifPreset,
  sourceWidth: number,
  sourceHeight: number,
  start: number,
  end: number,
) {
  const preset = VIDEO_GIF_PRESETS.find((item) => item.id === id)!;
  const fps = Math.max(
    1,
    Math.min(preset.fps, Math.floor(MAX_VIDEO_GIF_FRAMES / (end - start))),
  );
  return {
    fps,
    colors: preset.colors,
    width: defaultVideoGifWidth(
      sourceWidth,
      sourceHeight,
      start,
      end,
      fps,
      preset.width,
    ),
  };
}

/** Picks the largest default width that fits inside the GIF memory budget. */
export function defaultVideoGifWidth(
  sourceWidth: number,
  sourceHeight: number,
  start: number,
  end: number,
  fps: number,
  preferredWidth = MAX_VIDEO_GIF_DIMENSION,
): number {
  const target = Math.min(MAX_VIDEO_GIF_DIMENSION, sourceWidth, preferredWidth);
  const candidates = [target, 480, 400, 320, 240, 160, 120];
  const unique = Array.from(
    new Set(candidates.filter((value) => value >= 1 && value <= target)),
  ).sort((a, b) => b - a);

  for (const width of unique) {
    try {
      planVideoGif({
        start,
        end,
        fps,
        colors: 128,
        speed: 1,
        width,
        sourceWidth,
        sourceHeight,
      });
      return width;
    } catch {
      // Try the next smaller width.
    }
  }
  return Math.max(1, Math.min(120, sourceWidth));
}

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const tenths = Math.round(seconds * 10);
  const hours = Math.floor(tenths / 36_000);
  const minutes = Math.floor((tenths % 36_000) / 600);
  const rest = ((tenths % 600) / 10).toFixed(1).padStart(4, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

export function buildVideoGifName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim() || "video";
  return `${base}-lowquality.gif`;
}
