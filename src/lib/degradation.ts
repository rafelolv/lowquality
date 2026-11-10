import type { DegradationSettings, EnabledEffects } from "../types";
import {
  addNoise,
  adjustColor,
  applyGlitch,
  bleedChroma,
  hashString,
  hasTransparency,
  preserveAlpha,
  reduceColors,
  sharpenImage,
} from "./effects";

export class JobCancelledError extends Error {
  constructor() {
    super("Processing cancelled");
    this.name = "JobCancelledError";
  }
}

export interface PipelineHooks {
  isCancelled: () => boolean;
  onStage?: (stage: string, progress: number) => void;
  /**
   * Yield to the worker event loop so cancel and newer preview requests can be
   * handled. It should throw JobCancelledError when the job is obsolete.
   */
  checkpoint?: (stage: string, progress: number) => Promise<void>;
}

export async function checkpoint(
  hooks: PipelineHooks,
  stage: string,
  progress: number,
): Promise<void> {
  if (hooks.isCancelled()) throw new JobCancelledError();
  hooks.onStage?.(stage, progress);
  if (hooks.checkpoint) await hooks.checkpoint(stage, progress);
  if (hooks.isCancelled()) throw new JobCancelledError();
}

export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxDimension / Math.max(1, width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

function createCanvas(width: number, height: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
}

function contextFor(
  canvas: OffscreenCanvas,
): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("This browser could not create a 2D canvas context.");
  }
  return context;
}

function downAndUp(
  source: OffscreenCanvas,
  smallWidth: number,
  smallHeight: number,
  smoothing: boolean,
): OffscreenCanvas {
  const small = createCanvas(smallWidth, smallHeight);
  const smallContext = contextFor(small);
  smallContext.imageSmoothingEnabled = smoothing;
  smallContext.imageSmoothingQuality = "low";
  smallContext.drawImage(source, 0, 0, smallWidth, smallHeight);

  const output = createCanvas(source.width, source.height);
  const outputContext = contextFor(output);
  outputContext.imageSmoothingEnabled = smoothing;
  outputContext.imageSmoothingQuality = smoothing ? "low" : "high";
  outputContext.drawImage(small, 0, 0, source.width, source.height);
  return output;
}

async function jpegRoundTrip(
  canvas: OffscreenCanvas,
  quality: number,
  generation: number,
): Promise<OffscreenCanvas> {
  const context = contextFor(canvas);
  const before = context.getImageData(0, 0, canvas.width, canvas.height);
  const transparent = hasTransparency(before.data, 255);

  // Re-encoding an unchanged JPEG on the same DCT grid quickly converges.
  // Move that grid using padding, then crop back to the exact source bounds.
  // The subject stays still; each generation damages different block edges.
  const offsetX = generation === 0 ? 0 : 1 + ((generation * 3) % 7);
  const offsetY = generation === 0 ? 0 : 1 + ((generation * 5) % 7);
  let encodingCanvas = canvas;
  if (generation > 0) {
    encodingCanvas = createCanvas(canvas.width + 8, canvas.height + 8);
    const encodingContext = contextFor(encodingCanvas);
    // Fill padding with image colours before placing the unscaled source.
    encodingContext.drawImage(
      canvas,
      0,
      0,
      encodingCanvas.width,
      encodingCanvas.height,
    );
    encodingContext.drawImage(canvas, offsetX, offsetY);
  }
  const blob = await encodingCanvas.convertToBlob({
    type: "image/jpeg",
    quality: Math.min(1, Math.max(0.01, quality / 100)),
  });
  if (blob.type !== "image/jpeg") {
    throw new Error("JPEG compression is not supported by this browser.");
  }

  const bitmap = await createImageBitmap(blob);
  const output = createCanvas(canvas.width, canvas.height);
  const outputContext = contextFor(output);
  outputContext.drawImage(
    bitmap,
    offsetX,
    offsetY,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();

  if (transparent) {
    // JPEG has no alpha channel. Restore the source's alpha mask so transparent
    // PNG/WebP/GIF frames stay transparent while the RGB is genuinely compressed.
    const compressed = outputContext.getImageData(
      0,
      0,
      output.width,
      output.height,
    );
    preserveAlpha(compressed.data, before.data);
    outputContext.putImageData(compressed, 0, 0);
  }

  return output;
}

/**
 * The shared degradation pipeline. Text is already baked into `overlay` and is
 * drawn before any destructive step, so it gets blurred, compressed, noised and
 * torn along with the image.
 */
export async function degradeImage(
  source: CanvasImageSource,
  targetWidth: number,
  targetHeight: number,
  overlay: CanvasImageSource | null,
  settings: DegradationSettings,
  enabled: EnabledEffects,
  seed: number,
  hooks: PipelineHooks,
): Promise<OffscreenCanvas> {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  let canvas = createCanvas(width, height);
  let context = contextFor(canvas);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  if (overlay) {
    // The overlay bitmap contains only text and is aligned to the logical image.
    context.drawImage(overlay, 0, 0, width, height);
  }
  await checkpoint(hooks, "Compositing text", 6);

  if (
    enabled.resolution &&
    settings.resolution < 99 &&
    settings.resolution > 0
  ) {
    const scale = Math.max(0.02, settings.resolution / 100);
    const smallWidth = Math.max(1, Math.round(width * scale));
    const smallHeight = Math.max(1, Math.round(height * scale));
    if (smallWidth < width || smallHeight < height) {
      canvas = downAndUp(canvas, smallWidth, smallHeight, true);
      context = contextFor(canvas);
    }
    await checkpoint(hooks, "Reducing resolution", 20);
  }

  if (enabled.pixelate && settings.pixelSize > 1) {
    const block = Math.max(
      1,
      Math.round((settings.pixelSize / 1000) * Math.max(width, height)),
    );
    if (block > 1) {
      const smallWidth = Math.max(1, Math.ceil(width / block));
      const smallHeight = Math.max(1, Math.ceil(height / block));
      canvas = downAndUp(canvas, smallWidth, smallHeight, false);
      context = contextFor(canvas);
    }
    await checkpoint(hooks, "Pixelating", 31);
  }

  let imageData = context.getImageData(0, 0, width, height);
  if (
    (enabled.contrast && settings.contrast !== 100) ||
    (enabled.saturation && settings.saturation !== 100)
  ) {
    imageData = new ImageData(
      adjustColor(
        imageData.data,
        enabled.contrast ? settings.contrast : 100,
        enabled.saturation ? settings.saturation : 100,
      ),
      width,
      height,
    );
    await checkpoint(hooks, "Frying colours", 43);
  }

  if (enabled.sharpen && settings.sharpen > 0) {
    imageData = new ImageData(
      sharpenImage(imageData.data, width, height, settings.sharpen),
      width,
      height,
    );
    await checkpoint(hooks, "Over-sharpening", 57);
  }

  if (enabled.noise && settings.noise > 0) {
    imageData = new ImageData(
      addNoise(imageData.data, settings.noise, seed ^ 0x9e3779b9),
      width,
      height,
    );
    await checkpoint(hooks, "Adding noise", 69);
  }

  if (enabled.glitch && settings.glitch > 0) {
    imageData = new ImageData(
      applyGlitch(
        imageData.data,
        width,
        height,
        settings.glitch,
        seed ^ 0x85ebca6b,
      ),
      width,
      height,
    );
    await checkpoint(hooks, "Tearing signal", 81);
  }

  if (enabled.colors && settings.colorCount < 256) {
    imageData = new ImageData(
      reduceColors(imageData.data, settings.colorCount),
      width,
      height,
    );
    await checkpoint(hooks, "Crushing colours", 90);
  }

  context.putImageData(imageData, 0, 0);

  const jpegEnabled = enabled.jpeg && settings.jpegQuality < 100;
  if (jpegEnabled) {
    // Chroma loses detail independently of luminance, preserving recognizable
    // shapes while producing muddy, bleeding colours at low JPEG quality.
    const damage = Math.pow(1 - settings.jpegQuality / 100, 2) * 100;
    if (damage > 1) {
      const pixels = contextFor(canvas).getImageData(0, 0, width, height);
      contextFor(canvas).putImageData(
        new ImageData(
          bleedChroma(pixels.data, width, height, damage),
          width,
          height,
        ),
        0,
        0,
      );
      await checkpoint(hooks, "Bleeding JPEG colours", 90);
    }
    const passes =
      1 +
      (enabled.compressionLoops ? Math.max(0, settings.compressionPasses) : 0);
    for (let pass = 0; pass < passes; pass += 1) {
      if (hooks.isCancelled()) throw new JobCancelledError();
      canvas = await jpegRoundTrip(canvas, settings.jpegQuality, pass);
      if (hooks.checkpoint) {
        await hooks.checkpoint(
          "Chewing on JPEGs",
          90 + Math.round(((pass + 1) / passes) * 9),
        );
      }
    }
  }

  await checkpoint(hooks, "Finished", 100);
  return canvas;
}

export async function encodeCanvas(
  canvas: OffscreenCanvas,
  format: "png" | "jpeg" | "webp",
  quality?: number,
): Promise<Blob> {
  if (format === "jpeg") {
    // JPEG has no alpha. Flatten transparency onto a neutral white matte.
    const flattened = createCanvas(canvas.width, canvas.height);
    const context = contextFor(flattened);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, flattened.width, flattened.height);
    context.drawImage(canvas, 0, 0);
    const blob = await flattened.convertToBlob({
      type: "image/jpeg",
      quality: quality ?? 0.92,
    });
    if (blob.type !== "image/jpeg") {
      throw new Error("JPEG export is not supported by this browser.");
    }
    return blob;
  }

  const mime = format === "webp" ? "image/webp" : "image/png";
  const blob = await canvas.convertToBlob({
    type: mime,
    ...(quality === undefined ? {} : { quality }),
  });
  if (blob.type !== mime) {
    throw new Error(
      format === "webp"
        ? "WebP export is not supported by this browser."
        : "PNG export is not supported by this browser.",
    );
  }
  return blob;
}

export function seedFor(
  settings: DegradationSettings,
  frameIndex: number,
): number {
  return hashString(JSON.stringify(settings)) + frameIndex * 7919;
}
