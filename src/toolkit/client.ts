import { sanitizeSvg, validateStaticFile } from "../lib/imageLoader";
import { MAX_STATIC_DIMENSION, MAX_STATIC_PIXELS } from "../lib/constants";
import type { Request, Result } from "../lib/toolkit/protocol";
export function startJob(request: Request, progress?: (value: number) => void) {
  const worker = new Worker(
    new URL("../workers/toolkit.worker.ts", import.meta.url),
    { type: "module" },
  );
  let cancelled = false;
  let rejectJob: (error: Error) => void = () => {};
  const promise = new Promise<Result>((resolve, reject) => {
    rejectJob = reject;
    worker.onmessage = (
      event: MessageEvent<{
        progress?: number;
        error?: string;
        result?: Result;
      }>,
    ) => {
      if (event.data.progress !== undefined) {
        progress?.(event.data.progress);
        return;
      }
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Local processor failed. Try another image."));
    };
    async function send() {
      let bitmap: ImageBitmap | undefined;
      try {
        if (request.file && request.options.tool !== "gif") {
          const format = validateStaticFile(request.file);
          if (format.animated)
            throw new Error(
              "GIF files belong in GIF Kit. Choose a still image for this tool.",
            );
          if (format.mime === "image/svg+xml") {
            // Browsers cannot decode SVG blobs in workers. Use the existing local
            // sanitizer and browser SVG decoder; transform and encode in worker.
            const safe = sanitizeSvg(await request.file.text());
            const url = URL.createObjectURL(
              new Blob([safe], { type: "image/svg+xml" }),
            );
            try {
              const image = new Image();
              image.src = url;
              await image.decode();
              if (
                !image.naturalWidth ||
                !image.naturalHeight ||
                Math.max(image.naturalWidth, image.naturalHeight) >
                  MAX_STATIC_DIMENSION ||
                image.naturalWidth * image.naturalHeight > MAX_STATIC_PIXELS
              )
                throw new Error("SVG exceeds the 8192px / 32 megapixel limit.");
              bitmap = await createImageBitmap(image);
            } finally {
              URL.revokeObjectURL(url);
            }
          }
        }
        if (cancelled) {
          bitmap?.close();
          return;
        }
        worker.postMessage({ ...request, bitmap }, bitmap ? [bitmap] : []);
      } catch (error) {
        bitmap?.close();
        worker.terminate();
        reject(error);
      }
    }
    void send();
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      worker.terminate();
      rejectJob(new DOMException("Cancelled", "AbortError"));
    },
  };
}
