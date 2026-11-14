import type { VideoGifPlan } from "./videoGifPlan";
import type { VideoGifCommand, VideoGifEvent } from "./videoGifWorkerProtocol";

export interface VideoGifCaptureOptions {
  start: number;
  fps: number;
  colors: number;
  reverse: boolean;
  loop: boolean;
  signal: AbortSignal;
  onProgress?: (progress: number, stage: string) => void;
}

function cancelled(): DOMException {
  return new DOMException("Cancelled", "AbortError");
}

function ensureCanvas(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);
  return context;
}

function waitForLoadedData(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      window.clearTimeout(timer);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This browser could not decode the video."));
    };
    const onAbort = () => {
      cleanup();
      reject(cancelled());
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video took too long to load."));
    }, 15_000);
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function waitForPresentedFrame(video: HTMLVideoElement): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(finish, 250);
    video.requestVideoFrameCallback(finish);
  });
}

async function seekVideo(
  video: HTMLVideoElement,
  time: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw cancelled();
  const duration = Number.isFinite(video.duration)
    ? Math.max(0, video.duration - 0.001)
    : time;
  const target = Math.min(Math.max(0, time), duration);
  if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
    return;
  }

  // Register the frame callback before changing currentTime. A paused video
  // only presents a new frame after the seek, so registering afterwards can
  // miss the callback and stall until the timeout.
  const presented = waitForPresentedFrame(video);
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      window.clearTimeout(timer);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("This video frame could not be decoded."));
    };
    const onAbort = () => {
      cleanup();
      reject(cancelled());
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("The video stopped responding while seeking."));
    }, 15_000);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      video.currentTime = target;
    } catch {
      cleanup();
      reject(new Error("This video cannot seek to that moment."));
    }
  });
  await presented;
}

export async function convertVideoToGif(
  video: HTMLVideoElement,
  plan: VideoGifPlan,
  options: VideoGifCaptureOptions,
): Promise<Blob> {
  const { signal } = options;
  if (signal.aborted) throw cancelled();
  await waitForLoadedData(video, signal);
  if (signal.aborted) throw cancelled();

  const context = ensureCanvas(plan.width, plan.height);
  video.pause();

  const worker = new Worker(
    new URL("../workers/videoGif.worker.ts", import.meta.url),
    { type: "module" },
  );
  let resolveDone: (bytes: ArrayBuffer) => void = () => {};
  let rejectDone: (error: Error) => void = () => {};
  const done = new Promise<ArrayBuffer>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  // The capture loop can fail before it awaits `done`; keep that rejection
  // handled while still surfacing it if the conversion reaches the await.
  void done.catch(() => {});

  let encoded = 0;
  let captureComplete = false;
  const report = (progress: number, stage: string) => {
    options.onProgress?.(Math.max(0, Math.min(100, progress)), stage);
  };
  const onAbort = () => {
    worker.terminate();
    rejectDone(cancelled());
  };

  worker.onmessage = (event: MessageEvent<VideoGifEvent>) => {
    const message = event.data;
    if (message.type === "progress") {
      encoded = message.encoded;
      if (captureComplete) {
        report(
          80 + (encoded / Math.max(1, plan.frameCount)) * 18,
          `Encoding GIF frame ${encoded} of ${plan.frameCount}`,
        );
      }
      return;
    }
    if (message.type === "done") {
      resolveDone(message.bytes);
      return;
    }
    rejectDone(new Error(message.message));
  };
  worker.onerror = () => {
    rejectDone(new Error("The local video encoder stopped unexpectedly."));
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const start: VideoGifCommand = {
      type: "start",
      width: plan.width,
      height: plan.height,
      delay: plan.delay,
      repeat: options.loop ? 0 : -1,
      frameCount: plan.frameCount,
      reverse: options.reverse,
      colors: plan.colors,
    };
    worker.postMessage(start);

    report(0, "Warming up the frame grabber");
    for (let index = 0; index < plan.frameCount; index++) {
      if (signal.aborted) throw cancelled();
      const time = plan.start + index / options.fps;
      await seekVideo(video, time, signal);
      context.drawImage(video, 0, 0, plan.width, plan.height);
      const pixels = context.getImageData(0, 0, plan.width, plan.height).data;
      const frame: VideoGifCommand = {
        type: "frame",
        pixels: pixels.buffer,
      };
      worker.postMessage(frame, [pixels.buffer]);
      report(
        ((index + 1) / plan.frameCount) * 80,
        `Capturing frame ${index + 1} of ${plan.frameCount}`,
      );
    }

    captureComplete = true;
    report(80, "Encoding the final palette");
    worker.postMessage({ type: "finish" } satisfies VideoGifCommand);
    const bytes = await done;
    report(100, "GIF ready");
    return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
  } finally {
    signal.removeEventListener("abort", onAbort);
    worker.terminate();
    try {
      video.currentTime = plan.start;
    } catch {
      // The preview can keep its current frame if the element is gone.
    }
  }
}
