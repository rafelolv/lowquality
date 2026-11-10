/// <reference lib="webworker" />

import { parseGIF } from "gifuct-js";
import type { ParsedGif } from "gifuct-js";
import { GIFEncoder } from "gifenc";
import {
  MAX_GIF_DIMENSION,
  MAX_GIF_FRAMES,
  MAX_GIF_TOTAL_PIXELS,
  MAX_STATIC_DIMENSION,
  MAX_STATIC_PIXELS,
} from "../lib/constants";
import {
  JobCancelledError,
  degradeImage,
  encodeCanvas,
  fitWithin,
  seedFor,
  type PipelineHooks,
} from "../lib/degradation";
import {
  compositeGifFrames,
  decodeGifFrames,
  extractGifLoopCount,
  getGifBackground,
  normalizeGifDelay,
  prepareGifFrame,
} from "../lib/gifCodec";
import { probeGif } from "../lib/gifProbe";
import type { CompressFormat, GifDecodeMeta, WorkerErrorCode } from "../types";
import type {
  CancelRequest,
  CompressStaticRequest,
  DecodeGifRequest,
  ExportGifRequest,
  ExportGifStillRequest,
  ExportStaticRequest,
  InitStaticRequest,
  ProcessGifPreviewRequest,
  ProcessStaticPreviewRequest,
  SetOverlayRequest,
  WorkerRequest,
  WorkerResponse,
} from "../lib/workerProtocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

interface StaticSource {
  width: number;
  height: number;
  bitmap: ImageBitmap;
}

interface GifFrameSource {
  bitmap: ImageBitmap;
  delay: number;
}

interface GifSource {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  frameCount: number;
  loopCount: number;
  durationMs: number;
  delays: number[];
  frames: GifFrameSource[];
}

interface OverlayEntry {
  id: string;
  width: number;
  height: number;
  canvas: OffscreenCanvas | null;
}

let staticSource: StaticSource | null = null;
let gifSource: GifSource | null = null;

const overlays = new Map<string, OverlayEntry>();
/** Overlay currently captured by an active job; never prune it. */
let activeOverlayId: string | null = null;
const cancelledJobs = new Set<string>();
const jobQueue: RunnableRequest[] = [];
let activeJobId: string | null = null;
let activeJobIsPreview = false;
let pumping = false;

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "overlay") {
    storeOverlay(message);
    return;
  }

  if (message.type === "cancel") {
    cancelJob(message);
    return;
  }

  if (isPreviewRequest(message)) {
    // A new slider position makes every older preview obsolete immediately.
    if (activeJobId && activeJobIsPreview) {
      cancelledJobs.add(activeJobId);
    }
    for (let index = jobQueue.length - 1; index >= 0; index -= 1) {
      const queued = jobQueue[index];
      if (queued && isPreviewRequest(queued)) {
        jobQueue.splice(index, 1);
        postCancelled(queued.jobId);
      }
    }
  }

  if (!isRunnableRequest(message)) return;
  jobQueue.push(message);
  void pumpQueue();
});

type RunnableRequest = Exclude<
  WorkerRequest,
  SetOverlayRequest | CancelRequest
>;

function isPreviewRequest(
  request: WorkerRequest,
): request is ProcessStaticPreviewRequest | ProcessGifPreviewRequest {
  return (
    request.type === "process-static-preview" ||
    request.type === "process-gif-preview"
  );
}

function isRunnableRequest(request: WorkerRequest): request is RunnableRequest {
  return request.type !== "overlay" && request.type !== "cancel";
}

function post(response: WorkerResponse, transfer: Transferable[] = []): void {
  scope.postMessage(response, transfer);
}

function postCancelled(jobId: string): void {
  post({ type: "cancelled", jobId });
}

function postError(
  jobId: string,
  message: string,
  code: WorkerErrorCode,
): void {
  post({ type: "error", jobId, code, message });
}

function postProgress(jobId: string, progress: number, stage: string): void {
  post({ type: "progress", jobId, progress: Math.round(progress), stage });
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function pumpQueue(): Promise<void> {
  if (pumping) return;
  pumping = true;

  while (jobQueue.length > 0) {
    const request = jobQueue.shift();
    if (!request || !isRunnableRequest(request)) continue;

    if (cancelledJobs.has(request.jobId)) {
      cancelledJobs.delete(request.jobId);
      postCancelled(request.jobId);
      continue;
    }

    activeJobId = request.jobId;
    activeJobIsPreview = isPreviewRequest(request);

    try {
      await handleRequest(request);
    } catch (error) {
      if (
        error instanceof JobCancelledError ||
        cancelledJobs.has(request.jobId)
      ) {
        postCancelled(request.jobId);
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "The image could not be processed in this browser.";
        postError(request.jobId, message, "processing-failed");
      }
    } finally {
      cancelledJobs.delete(request.jobId);
      activeJobId = null;
      activeOverlayId = null;
      activeJobIsPreview = false;
    }
  }

  pumping = false;
}

function cancelJob(request: CancelRequest): void {
  if (activeJobId === request.jobId) cancelledJobs.add(request.jobId);
  for (let index = jobQueue.length - 1; index >= 0; index -= 1) {
    const queued = jobQueue[index];
    if (queued && queued.jobId === request.jobId) {
      jobQueue.splice(index, 1);
      postCancelled(request.jobId);
    }
  }
}

function storeOverlay(request: SetOverlayRequest): void {
  if (!request.buffer) {
    overlays.set(request.overlayId, {
      id: request.overlayId,
      width: 0,
      height: 0,
      canvas: null,
    });
  } else {
    const expected = request.width * request.height * 4;
    if (request.buffer.byteLength !== expected) return;

    const canvas = new OffscreenCanvas(request.width, request.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the text overlay.");
    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(request.buffer),
        request.width,
        request.height,
      ),
      0,
      0,
    );
    overlays.set(request.overlayId, {
      id: request.overlayId,
      width: request.width,
      height: request.height,
      canvas,
    });
  }

  // Keep only the latest overlay plus revisions captured by queued/active jobs.
  // Six full-resolution 32 MP overlays would otherwise retain almost 800 MB.
  const needed = new Set([request.overlayId, activeOverlayId]);
  for (const queued of jobQueue) {
    if ("overlayId" in queued) needed.add(queued.overlayId);
  }
  for (const [id, entry] of overlays) {
    if (needed.has(id)) continue;
    if (entry.canvas) {
      entry.canvas.width = 0;
      entry.canvas.height = 0;
    }
    overlays.delete(id);
  }
}

function getOverlay(overlayId: string): OverlayEntry | null {
  if (overlayId === "none") return null;
  const entry = overlays.get(overlayId);
  if (!entry) {
    throw new Error(
      "The text layer went out of sync with the preview. Nudge a control to retry.",
    );
  }
  activeOverlayId = overlayId;
  return entry;
}

function makeHooks(
  jobId: string,
  options: { reportStages?: boolean } = {},
): PipelineHooks {
  let lastYield = performance.now();
  return {
    isCancelled: () => cancelledJobs.has(jobId),
    onStage: options.reportStages
      ? (stage, progress) => postProgress(jobId, progress, stage)
      : undefined,
    checkpoint: async () => {
      if (cancelledJobs.has(jobId)) throw new JobCancelledError();
      const now = performance.now();
      if (now - lastYield > 24) {
        lastYield = now;
        await tick();
      }
      if (cancelledJobs.has(jobId)) throw new JobCancelledError();
    },
  };
}

async function handleRequest(request: RunnableRequest): Promise<void> {
  switch (request.type) {
    case "init-static":
      await handleInitStatic(request);
      break;
    case "decode-gif":
      await handleDecodeGif(request);
      break;
    case "process-static-preview":
      await handleStaticPreview(request);
      break;
    case "export-static":
      await handleStaticExport(request);
      break;
    case "compress-static":
      await handleStaticCompress(request);
      break;
    case "process-gif-preview":
      await handleGifPreview(request);
      break;
    case "export-gif":
      await handleGifExport(request);
      break;
    case "export-gif-still":
      await handleGifStillExport(request);
      break;
    case "reset":
      handleReset();
      post({ type: "reset-done", jobId: request.jobId });
      break;
  }
}

function handleReset(): void {
  disposeStaticSource();
  disposeGifSource();
  for (const entry of overlays.values()) {
    if (entry.canvas) {
      const context = entry.canvas.getContext("2d");
      context?.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    }
  }
  overlays.clear();
  activeOverlayId = null;
}

async function handleInitStatic(request: InitStaticRequest): Promise<void> {
  const { width, height, buffer } = request;
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_STATIC_DIMENSION ||
    height > MAX_STATIC_DIMENSION ||
    width * height > MAX_STATIC_PIXELS
  ) {
    throw new Error("This image exceeds the safe working size.");
  }
  if (buffer.byteLength !== width * height * 4) {
    throw new Error("The decoded image data was malformed.");
  }

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot process images locally.");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(buffer), width, height),
    0,
    0,
  );
  const bitmap = await createImageBitmap(canvas);

  if (cancelledJobs.has(request.jobId)) {
    bitmap.close();
    throw new JobCancelledError();
  }
  disposeStaticSource();
  disposeGifSource();
  staticSource = { width, height, bitmap };
  post({ type: "ready-static", jobId: request.jobId });
}

async function handleDecodeGif(request: DecodeGifRequest): Promise<void> {
  postProgress(request.jobId, 2, "Reading GIF");
  await tick();

  let parsed: ParsedGif;
  try {
    probeGif(request.buffer);
    parsed = parseGIF(request.buffer);
  } catch {
    throw new Error("This GIF could not be parsed. It may be corrupt.");
  }

  const sourceWidth = parsed.lsd.width;
  const sourceHeight = parsed.lsd.height;
  const imageFrameCount = parsed.frames.filter(
    (frame) => "image" in frame && frame.image,
  ).length;

  if (sourceWidth < 1 || sourceHeight < 1) {
    throw new Error("This GIF has invalid dimensions.");
  }
  if (imageFrameCount < 1) {
    throw new Error("This GIF does not contain any image frames.");
  }
  if (imageFrameCount > MAX_GIF_FRAMES) {
    throw new Error(
      `This animation has ${imageFrameCount} frames. LowQuality can handle up to ${MAX_GIF_FRAMES} frames safely.`,
    );
  }

  const scale = Math.min(1, Math.max(0.05, request.scale || 1));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (
    width > MAX_GIF_DIMENSION ||
    height > MAX_GIF_DIMENSION ||
    width * height * imageFrameCount > MAX_GIF_TOTAL_PIXELS
  ) {
    throw new Error(
      "This GIF is too large for safe in-browser processing. Reload it at a smaller size.",
    );
  }

  if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
  postProgress(request.jobId, 8, "Compositing frames");

  const background = getGifBackground(
    parsed,
    parsed.frames.map((frame) => ({
      transparentIndex:
        "gce" in frame && frame.gce?.extras.transparentColorGiven
          ? frame.gce.transparentColorIndex
          : undefined,
    })),
  );
  const loopCount = extractGifLoopCount(parsed);
  const decodedFrames: GifFrameSource[] = [];
  const delays: number[] = [];
  let frameIndex = 0;

  try {
    for (const frame of compositeGifFrames(
      decodeGifFrames(parsed),
      sourceWidth,
      sourceHeight,
      background,
    )) {
      if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
      if (frameIndex % 4 === 0) await tick();

      const imageData = new ImageData(
        new Uint8ClampedArray(frame.pixels),
        sourceWidth,
        sourceHeight,
      );
      const bitmap =
        width === sourceWidth && height === sourceHeight
          ? await createImageBitmap(imageData)
          : await createImageBitmap(imageData, {
              resizeWidth: width,
              resizeHeight: height,
              resizeQuality: "high",
            });

      decodedFrames.push({ bitmap, delay: frame.delay });
      delays.push(frame.delay);
      frameIndex += 1;
      postProgress(
        request.jobId,
        8 + Math.round((frameIndex / imageFrameCount) * 90),
        `Compositing frame ${frameIndex}/${imageFrameCount}`,
      );

      if (frameIndex % 4 === 0) await tick();
    }
  } catch (error) {
    for (const frame of decodedFrames) frame.bitmap.close();
    throw error;
  }

  if (decodedFrames.length === 0) {
    throw new Error("This GIF did not produce any displayable frames.");
  }

  if (cancelledJobs.has(request.jobId)) {
    for (const frame of decodedFrames) frame.bitmap.close();
    throw new JobCancelledError();
  }
  const durationMs = delays.reduce((total, delay) => total + delay, 0);
  const meta: GifDecodeMeta = {
    sourceWidth,
    sourceHeight,
    width,
    height,
    frameCount: decodedFrames.length,
    durationMs,
    delays,
    loopCount,
    wasScaled: width !== sourceWidth || height !== sourceHeight,
  };

  disposeStaticSource();
  disposeGifSource();
  gifSource = {
    width,
    height,
    sourceWidth,
    sourceHeight,
    frameCount: decodedFrames.length,
    loopCount,
    durationMs,
    delays,
    frames: decodedFrames,
  };

  postProgress(request.jobId, 100, "GIF ready");
  post({ type: "ready-gif", jobId: request.jobId, meta });
}

function requireStaticSource(): StaticSource {
  if (!staticSource) throw new Error("No static image is loaded.");
  return staticSource;
}

function requireGifSource(): GifSource {
  if (!gifSource) throw new Error("No animated GIF is loaded.");
  return gifSource;
}

async function handleStaticPreview(
  request: ProcessStaticPreviewRequest,
): Promise<void> {
  const source = requireStaticSource();
  const overlay = getOverlay(request.overlayId);
  const target = fitWithin(source.width, source.height, request.maxDimension);
  const hooks = makeHooks(request.jobId, { reportStages: true });
  const canvas = await degradeImage(
    source.bitmap,
    target.width,
    target.height,
    overlay?.canvas ?? null,
    request.settings,
    request.enabled,
    seedFor(request.settings, 0),
    hooks,
  );

  const bitmap = await createImageBitmap(canvas);
  post(
    {
      type: "preview-static",
      jobId: request.jobId,
      width: target.width,
      height: target.height,
      bitmap,
    },
    [bitmap],
  );
}

async function handleStaticExport(request: ExportStaticRequest): Promise<void> {
  const source = requireStaticSource();
  const overlay = getOverlay(request.overlayId);
  const hooks = makeHooks(request.jobId, { reportStages: true });
  const canvas = await degradeImage(
    source.bitmap,
    source.width,
    source.height,
    overlay?.canvas ?? null,
    request.settings,
    request.enabled,
    seedFor(request.settings, 0),
    hooks,
  );

  postProgress(request.jobId, 96, "Writing file");
  const blob = await encodeCanvas(canvas, request.format);
  post({ type: "export-blob", jobId: request.jobId, blob, mime: blob.type });
}

interface CompressedCandidate {
  blob: Blob;
  width: number;
  height: number;
  quality: number;
}

const COMPRESS_BASE_QUALITY = 0.82;
const COMPRESS_MAX_QUALITY = 0.95;
const COMPRESS_MIN_MAX_DIMENSION = 240;

async function encodeCompressionCandidate(
  source: StaticSource,
  scale: number,
  quality: number,
  format: CompressFormat,
  jobId: string,
): Promise<CompressedCandidate> {
  if (cancelledJobs.has(jobId)) throw new JobCancelledError();
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the compressed image.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source.bitmap, 0, 0, width, height);
  const blob = await encodeCanvas(canvas, format, quality);
  if (cancelledJobs.has(jobId)) throw new JobCancelledError();
  return { blob, width, height, quality };
}

/**
 * Quality-first compression: at each resolution, search for the highest
 * encoder quality that fits. Dimensions only step down when even the quality
 * floor is too heavy at the current size.
 */
async function handleStaticCompress(
  request: CompressStaticRequest,
): Promise<void> {
  const source = requireStaticSource();
  const target = Math.max(64, Math.round(request.targetBytes));
  const floor = Math.min(
    COMPRESS_MAX_QUALITY,
    Math.max(0.3, request.qualityFloor),
  );
  const baseQuality = Math.max(COMPRESS_BASE_QUALITY, floor);
  const sourceMax = Math.max(source.width, source.height);
  const startScale =
    request.maxDimension > 0
      ? Math.min(1, request.maxDimension / sourceMax)
      : 1;
  let attempts = 0;
  let smallest: CompressedCandidate | null = null;

  const tryQuality = async (
    scale: number,
    quality: number,
  ): Promise<CompressedCandidate> => {
    attempts += 1;
    postProgress(
      request.jobId,
      Math.min(92, 6 + attempts * 8),
      `Testing ${Math.round(quality * 100)}% quality`,
    );
    const candidate = await encodeCompressionCandidate(
      source,
      scale,
      quality,
      request.format,
      request.jobId,
    );
    if (!smallest || candidate.blob.size < smallest.blob.size) {
      smallest = candidate;
    }
    return candidate;
  };

  const searchHighestQuality = async (
    scale: number,
    lowQuality: number,
    lowCandidate: CompressedCandidate,
    highQuality: number,
  ): Promise<CompressedCandidate> => {
    if (highQuality - lowQuality < 0.01) return lowCandidate;
    let low = lowQuality;
    let high = highQuality;
    let best = lowCandidate;
    for (let step = 0; step < 5; step += 1) {
      const quality = (low + high) / 2;
      const next = await tryQuality(scale, quality);
      if (next.blob.size <= target) {
        best = next;
        low = quality;
      } else {
        high = quality;
      }
    }
    return best;
  };

  let scale = startScale;
  let hit: CompressedCandidate | null = null;

  for (let round = 0; round < 9; round += 1) {
    const candidate = await tryQuality(scale, baseQuality);
    if (candidate.blob.size <= target) {
      hit = await searchHighestQuality(
        scale,
        baseQuality,
        candidate,
        COMPRESS_MAX_QUALITY,
      );
      break;
    }

    // The comfortable quality is too heavy. Use the floor before shrinking.
    let floorCandidate = candidate;
    if (baseQuality > floor) {
      floorCandidate = await tryQuality(scale, floor);
      if (floorCandidate.blob.size <= target) {
        hit = await searchHighestQuality(
          scale,
          floor,
          floorCandidate,
          baseQuality,
        );
        break;
      }
    }

    const currentMaxDimension = sourceMax * scale;
    if (currentMaxDimension <= COMPRESS_MIN_MAX_DIMENSION) break;
    const estimated = Math.sqrt(target / floorCandidate.blob.size) * 1.03;
    const factor = Math.max(0.7, Math.min(0.9, estimated));
    scale *= factor;
  }

  const chosen = hit ?? smallest;
  if (!chosen) throw new Error("The image could not be compressed.");
  postProgress(request.jobId, 96, "Writing file");
  post({
    type: "compressed-blob",
    jobId: request.jobId,
    blob: chosen.blob,
    mime: chosen.blob.type,
    width: chosen.width,
    height: chosen.height,
    quality: chosen.quality,
    attempts,
    hitTarget: hit !== null,
  });
}

async function handleGifPreview(
  request: ProcessGifPreviewRequest,
): Promise<void> {
  const source = requireGifSource();
  const overlay = getOverlay(request.overlayId);
  const framePixels = source.width * source.height;
  const scale = Math.min(
    1,
    request.maxDimension / Math.max(source.width, source.height),
    Math.sqrt(
      request.pixelBudget / Math.max(1, framePixels * source.frameCount),
    ),
  );
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const outputFrames: Array<{ bitmap: ImageBitmap; delay: number }> = [];

  try {
    for (let index = 0; index < source.frames.length; index += 1) {
      if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
      const frame = source.frames[index];
      const hooks = makeHooks(request.jobId);
      const canvas = await degradeImage(
        frame.bitmap,
        width,
        height,
        overlay?.canvas ?? null,
        request.settings,
        request.enabled,
        seedFor(request.settings, index),
        hooks,
      );

      const bitmap = await createImageBitmap(canvas);
      outputFrames.push({ bitmap, delay: frame.delay });
      postProgress(
        request.jobId,
        2 + Math.round(((index + 1) / source.frameCount) * 97),
        `Destroying frame ${index + 1}/${source.frameCount}`,
      );

      await tick();
      if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
    }
  } catch (error) {
    for (const frame of outputFrames) frame.bitmap.close();
    throw error;
  }

  post(
    {
      type: "preview-gif",
      jobId: request.jobId,
      width,
      height,
      frames: outputFrames,
    },
    outputFrames.map((frame) => frame.bitmap),
  );
}

async function handleGifExport(request: ExportGifRequest): Promise<void> {
  const source = requireGifSource();
  const overlay = getOverlay(request.overlayId);
  const scale = Math.min(1, Math.max(0.05, request.outputScale));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const encoder = GIFEncoder();

  for (let index = 0; index < source.frames.length; index += 1) {
    if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
    const frame = source.frames[index];
    const hooks = makeHooks(request.jobId);
    const canvas = await degradeImage(
      frame.bitmap,
      width,
      height,
      overlay?.canvas ?? null,
      request.settings,
      request.enabled,
      seedFor(request.settings, index),
      hooks,
    );

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read a processed frame.");
    const rgba = context.getImageData(0, 0, width, height).data;
    const prepared = prepareGifFrame(rgba, width, height);

    encoder.writeFrame(prepared.indices, width, height, {
      palette: prepared.palette,
      delay: normalizeGifDelay(frame.delay),
      transparent: prepared.transparent,
      transparentIndex: prepared.transparentIndex,
      dispose: 2,
      repeat: index === 0 ? source.loopCount : -1,
    });

    postProgress(
      request.jobId,
      2 + Math.round(((index + 1) / source.frameCount) * 96),
      `Encoding frame ${index + 1}/${source.frameCount}`,
    );

    await tick();
    if (cancelledJobs.has(request.jobId)) throw new JobCancelledError();
  }

  encoder.finish();
  const encoded = encoder.bytes();
  const bytes = new Uint8Array(encoded.length);
  bytes.set(encoded);
  const blob = new Blob([bytes.buffer], { type: "image/gif" });
  post({ type: "export-blob", jobId: request.jobId, blob, mime: "image/gif" });
}

async function handleGifStillExport(
  request: ExportGifStillRequest,
): Promise<void> {
  const source = requireGifSource();
  const overlay = getOverlay(request.overlayId);
  const firstFrame = source.frames[0];
  if (!firstFrame)
    throw new Error("This GIF does not contain a displayable frame.");
  const scale = Math.min(1, Math.max(0.05, request.outputScale));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const hooks = makeHooks(request.jobId, { reportStages: true });
  const canvas = await degradeImage(
    firstFrame.bitmap,
    width,
    height,
    overlay?.canvas ?? null,
    request.settings,
    request.enabled,
    seedFor(request.settings, 0),
    hooks,
  );
  postProgress(request.jobId, 96, "Writing still frame");
  const blob = await encodeCanvas(canvas, request.format);
  post({ type: "export-blob", jobId: request.jobId, blob, mime: blob.type });
}

function disposeStaticSource(): void {
  if (staticSource) {
    staticSource.bitmap.close();
    staticSource = null;
  }
}

function disposeGifSource(): void {
  if (gifSource) {
    for (const frame of gifSource.frames) frame.bitmap.close();
    gifSource = null;
  }
}
