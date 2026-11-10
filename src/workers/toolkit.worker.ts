/// <reference lib="webworker" />
import { encodeCanvas } from "../lib/degradation";
import { searchCompression } from "../lib/toolkit/compressSearch";
import {
  clampCrop,
  dimension,
  fitSize,
  FAVICON_SIZES,
  gifDelay,
  squareCrop,
  aspectCrop,
} from "../lib/toolkit/geometry";
import { zip } from "../lib/toolkit/zip";
import type { Options, Request, Result } from "../lib/toolkit/protocol";
import {
  MAX_GIF_FILE_BYTES,
  MAX_GIF_FRAMES,
  MAX_GIF_TOTAL_PIXELS,
  MAX_GIF_DIMENSION,
  MAX_STATIC_FILE_BYTES,
  MAX_STATIC_PIXELS,
} from "../lib/constants";
import { readMetadata } from "../lib/toolkit/metadata";
import { makeIco, ICON_HTML } from "../lib/toolkit/icons";
import { parseGIF } from "gifuct-js";
import { GIFEncoder } from "gifenc";
import { probeGif } from "../lib/gifProbe";
import {
  decodeGifFrames,
  compositeGifFrames,
  getGifBackground,
  extractGifLoopCount,
  prepareGifFrame,
} from "../lib/gifCodec";
const scope = self as DedicatedWorkerGlobalScope;
function context(canvas: OffscreenCanvas) {
  const value = canvas.getContext("2d");
  if (!value) throw new Error("Canvas unavailable.");
  return value;
}
function canvas(width: number, height: number) {
  width = dimension(width);
  height = dimension(height);
  if (width * height > MAX_STATIC_PIXELS)
    throw new Error("Output exceeds the 32 megapixel limit.");
  return new OffscreenCanvas(width, height);
}
async function process(
  file: File,
  options: Options,
  inspect = false,
  suppliedBitmap?: ImageBitmap,
): Promise<Result> {
  if (options.tool === "gif") return processGif(file, options, inspect);
  if (file.size > MAX_STATIC_FILE_BYTES)
    throw new Error("Images must be under 30 MB.");
  const bitmap =
    suppliedBitmap ??
    (await createImageBitmap(file, { imageOrientation: "from-image" }));
  try {
    if (
      bitmap.width > 8192 ||
      bitmap.height > 8192 ||
      bitmap.width * bitmap.height > MAX_STATIC_PIXELS
    )
      throw new Error("Image exceeds the 8192px / 32 megapixel limit.");
    const sourceWidth = bitmap.width,
      sourceHeight = bitmap.height;
    const base = { sourceWidth, sourceHeight };
    const metadata = readMetadata(await file.arrayBuffer());
    scope.postMessage({ progress: 15 });
    if (inspect) {
      const size = fitSize(bitmap.width, bitmap.height, 1200);
      const preview = canvas(size.width, size.height);
      context(preview).drawImage(bitmap, 0, 0, preview.width, preview.height);
      return {
        ...base,
        width: bitmap.width,
        height: bitmap.height,
        blob: await encodeCanvas(preview, "png"),
        name: file.name,
        metadata,
      };
    }
    if (options.tool === "favicon") {
      const images: { size: number; blob: Blob }[] = [];
      const crop = options.padding
        ? { x: 0, y: 0, width: bitmap.width, height: bitmap.height }
        : aspectCrop(
            options.crop ?? squareCrop(bitmap.width, bitmap.height),
            bitmap.width,
            bitmap.height,
            1,
          );
      for (const size of FAVICON_SIZES) {
        const icon = canvas(size, size);
        const ctx = context(icon);
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, size, size);
        const factor = options.padding
          ? Math.min(size / crop.width, size / crop.height) * 0.8
          : Math.max(size / crop.width, size / crop.height);
        const w = crop.width * factor,
          h = crop.height * factor;
        ctx.drawImage(
          bitmap,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          (size - w) / 2,
          (size - h) / 2,
          w,
          h,
        );
        images.push({ size, blob: await encodeCanvas(icon, "png") });
      }
      const manifest = {
        name: "My App",
        short_name: "App",
        start_url: "./",
        display: "standalone",
        background_color: options.background,
        theme_color: options.background,
        icons: [192, 512].map((size) => ({
          src: `icon-${size}.png`,
          sizes: `${size}x${size}`,
          type: "image/png",
          purpose: "any",
        })),
      };
      const files = images.map(({ size, blob }) => ({
        name: `icon-${size}.png`,
        blob,
      }));
      files.push(
        {
          name: "favicon.ico",
          blob: await makeIco(images.filter((image) => image.size <= 48)),
        },
        {
          name: "manifest.webmanifest",
          blob: new Blob([JSON.stringify(manifest, null, 2)]),
        },
        {
          name: "README.txt",
          blob: new Blob([
            "Place these files beside your HTML. Edit manifest name and start_url before publishing.\n\n" +
              ICON_HTML,
          ]),
        },
      );
      return {
        ...base,
        width: 512,
        height: 512,
        blob: await zip(files),
        name: "lowquality-icons.zip",
        icons: images.filter((image) => image.size <= 48),
      };
    }
    const crop = clampCrop(
      options.crop ?? {
        x: 0,
        y: 0,
        width: bitmap.width,
        height: bitmap.height,
      },
      bitmap.width,
      bitmap.height,
    );
    const rotated = options.rotation % 180 !== 0;
    const transformed = canvas(
      rotated ? crop.height : crop.width,
      rotated ? crop.width : crop.height,
    );
    const t = context(transformed);
    t.translate(transformed.width / 2, transformed.height / 2);
    t.rotate((options.rotation * Math.PI) / 180);
    t.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
    t.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      -crop.width / 2,
      -crop.height / 2,
      crop.width,
      crop.height,
    );
    const desiredWidth =
      options.width ||
      (options.height
        ? (options.height * transformed.width) / transformed.height
        : transformed.width);
    const desiredHeight =
      options.height ||
      (options.width
        ? (options.width * transformed.height) / transformed.width
        : transformed.height);
    const size = fitSize(desiredWidth, desiredHeight, options.maxDimension);
    const output = canvas(size.width, size.height);
    const ctx = context(output);
    const factor =
      options.fit === "cover"
        ? Math.max(
            output.width / transformed.width,
            output.height / transformed.height,
          )
        : Math.min(
            output.width / transformed.width,
            output.height / transformed.height,
          );
    const w = transformed.width * factor,
      h = transformed.height * factor;
    ctx.drawImage(
      transformed,
      (output.width - w) / 2,
      (output.height - h) / 2,
      w,
      h,
    );
    if (options.tool === "redact") {
      for (const region of options.regions) {
        const r = clampCrop(region, output.width, output.height);
        const x = Math.floor(r.x),
          y = Math.floor(r.y),
          w = Math.max(1, Math.ceil(r.width)),
          h = Math.max(1, Math.ceil(r.height));
        if (options.mode === "pixelate") {
          const block = Math.max(4, Math.min(128, options.strength));
          const small = canvas(
            Math.max(1, Math.ceil(w / block)),
            Math.max(1, Math.ceil(h / block)),
          );
          context(small).drawImage(
            output,
            x,
            y,
            w,
            h,
            0,
            0,
            small.width,
            small.height,
          );
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.clearRect(x, y, w, h);
          ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
          ctx.restore();
        } else {
          // Copy avoids reading from the surface while writing a filtered version.
          const copy = canvas(output.width, output.height);
          context(copy).drawImage(output, 0, 0);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, w, h);
          ctx.clip();
          ctx.filter = `blur(${Math.max(2, Math.min(128, options.strength))}px)`;
          ctx.clearRect(x, y, w, h);
          ctx.drawImage(copy, 0, 0);
          ctx.restore();
        }
      }
    }
    let blob: Blob;
    let width = output.width,
      height = output.height;
    let hitTarget: boolean | undefined;
    if (options.targetBytes > 0) {
      if (options.format === "png")
        throw new Error("Target compression requires JPG or WebP.");
      const result = await searchCompression(
        width,
        height,
        { ...options, maxDimension: 0 },
        async (scale, quality) => {
          const c = canvas(
            Math.round(output.width * scale),
            Math.round(output.height * scale),
          );
          context(c).drawImage(output, 0, 0, c.width, c.height);
          return {
            blob: await encodeCanvas(c, options.format, quality),
            width: c.width,
            height: c.height,
            quality,
          };
        },
        (progress) => scope.postMessage({ progress }),
      );
      blob = result.blob;
      width = result.width;
      height = result.height;
      hitTarget = result.hitTarget;
    } else blob = await encodeCanvas(output, options.format, options.quality);
    return {
      ...base,
      blob,
      width,
      height,
      name: `${file.name.replace(/\.[^.]+$/, "")}-${options.tool}.${options.format === "jpeg" ? "jpg" : options.format}`,
      hitTarget,
      metadata:
        options.tool === "metadata"
          ? readMetadata(await blob.arrayBuffer())
          : undefined,
    };
  } finally {
    bitmap.close();
  }
}
async function processGif(
  file: File,
  options: Options,
  inspect: boolean,
): Promise<Result> {
  if (file.size > MAX_GIF_FILE_BYTES)
    throw new Error("GIFs must be under 25 MB.");
  const buffer = await file.arrayBuffer();
  const probe = probeGif(buffer);
  if (
    probe.frameCount > MAX_GIF_FRAMES ||
    probe.totalPixels > MAX_GIF_TOTAL_PIXELS ||
    Math.max(probe.width, probe.height) > MAX_GIF_DIMENSION
  )
    throw new Error(
      "GIF exceeds the 240 frame, 1600px or 36 million total pixel limit.",
    );
  const parsed = parseGIF(buffer);
  const loop = extractGifLoopCount(parsed);
  const background = getGifBackground(
    parsed,
    parsed.frames.flatMap((frame) =>
      "gce" in frame && frame.gce
        ? [
            {
              transparentIndex: frame.gce.extras.transparentColorGiven
                ? frame.gce.transparentColorIndex
                : undefined,
            },
          ]
        : [],
    ),
  );
  const sourceWidth = parsed.lsd.width,
    sourceHeight = parsed.lsd.height;
  const width = inspect ? sourceWidth : dimension(options.width || sourceWidth);
  const height = inspect
    ? sourceHeight
    : dimension(options.height || sourceHeight);
  if (
    Math.max(width, height) > MAX_GIF_DIMENSION ||
    width * height * probe.frameCount > MAX_GIF_TOTAL_PIXELS
  )
    throw new Error("Resized GIF exceeds animation pixel limits.");
  const source = canvas(sourceWidth, sourceHeight),
    output = canvas(width, height);
  const frames: { delay: number; pixels: Uint8ClampedArray }[] = [];
  for (const frame of compositeGifFrames(
    decodeGifFrames(parsed),
    sourceWidth,
    sourceHeight,
    background,
  )) {
    context(source).putImageData(
      new ImageData(
        new Uint8ClampedArray(frame.pixels),
        sourceWidth,
        sourceHeight,
      ),
      0,
      0,
    );
    context(output).clearRect(0, 0, width, height);
    context(output).drawImage(source, 0, 0, width, height);
    frames.push({
      delay: inspect ? frame.delay : gifDelay(frame.delay, options.speed),
      pixels: context(output).getImageData(0, 0, width, height).data,
    });
    scope.postMessage({
      progress: Math.round((frames.length / probe.frameCount) * 40),
    });
  }
  if (!frames.length) throw new Error("GIF contains no readable frames.");
  if (!inspect && options.reverse) frames.reverse();
  const encoder = GIFEncoder();
  const previews: { blob: Blob; delay: number }[] = [];
  const extracted: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (inspect || options.extract) {
      context(output).putImageData(
        new ImageData(new Uint8ClampedArray(frame.pixels), width, height),
        0,
        0,
      );
      const blob = await encodeCanvas(output, "png");
      if (inspect) previews.push({ blob, delay: frame.delay });
      else
        extracted.push({
          name: `frame-${String(i + 1).padStart(4, "0")}.png`,
          blob,
        });
    } else {
      const colors = Math.max(2, Math.round(options.colors * options.quality));
      const prepared = prepareGifFrame(frame.pixels, width, height, colors);
      encoder.writeFrame(prepared.indices, width, height, {
        palette: prepared.palette,
        transparent: prepared.transparent,
        transparentIndex: prepared.transparentIndex,
        delay: frame.delay,
        repeat: loop,
        dispose: prepared.transparent ? 2 : 1,
      });
    }
    scope.postMessage({
      progress: 40 + Math.round(((i + 1) / frames.length) * 55),
    });
  }
  let blob: Blob;
  if (inspect) blob = previews[0].blob;
  else if (options.extract) blob = await zip(extracted);
  else {
    encoder.finish();
    blob = new Blob([new Uint8Array(encoder.bytes())], { type: "image/gif" });
  }
  return {
    blob,
    name: inspect
      ? file.name
      : options.extract
        ? "lowquality-frames.zip"
        : "lowquality-animation.gif",
    width,
    height,
    sourceWidth,
    sourceHeight,
    frames: inspect ? previews : undefined,
    loop,
  };
}
scope.onmessage = async (event: MessageEvent<Request>) => {
  try {
    const { file, files, options, inspect, bitmap } = event.data;
    const result = files
      ? {
          blob: await zip(files),
          name: "lowquality-batch.zip",
          width: 0,
          height: 0,
          sourceWidth: 0,
          sourceHeight: 0,
        }
      : await process(file!, options, inspect, bitmap);
    scope.postMessage({ result });
  } catch (error) {
    scope.postMessage({
      error:
        error instanceof Error ? error.message : "Image processing failed.",
    });
  }
};
