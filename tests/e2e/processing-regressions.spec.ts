import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { decompressFrames, parseGIF } from "gifuct-js";
const { GIFEncoder } = createRequire(import.meta.url)(
  "gifenc",
) as typeof import("gifenc");
import {
  canvasSignature,
  canvasesMatch,
  fixture,
  getPreviewRevision,
  loadSample,
  setQuality,
  waitForPreview,
} from "./helpers";

test("duplicates independent text layers and exports the latest text immediately", async ({
  page,
}, testInfo) => {
  await loadSample(page);
  await setQuality(page, 0);
  let revision = await getPreviewRevision(page);
  await page.getByRole("switch", { name: "Enable text overlay" }).click();
  await waitForPreview(page, revision);
  await page.getByRole("button", { name: "Duplicate this text layer" }).click();
  await expect(page.locator(".text-layer-row")).toHaveCount(2);
  await expect(page.locator("#text-x")).toHaveValue("54");
  await page.locator("#text-layer-content").fill("SECOND LAYER");
  await expect(page.locator(".text-layer-row").first()).toContainText(
    "MAKE IT WORSE",
  );
  await expect(page.locator(".text-layer-row").last()).toContainText(
    "SECOND LAYER",
  );

  revision = await getPreviewRevision(page);
  await page.locator("#text-layer-content").fill("LATEST EXPORT TEXT");
  const downloadPromise = page.waitForEvent("download");
  // Do not wait for the 90ms text rasterization debounce before downloading.
  await page
    .getByTestId("download-disaster")
    .evaluate((button: HTMLButtonElement) => button.click());
  const download = await downloadPromise;
  const destination = testInfo.outputPath("latest-text.png");
  await download.saveAs(destination);
  await waitForPreview(page, revision);
  const bytes = readFileSync(destination).toString("base64");
  expect(
    await page.evaluate(async (base64) => {
      const blob = await (
        await fetch(`data:image/png;base64,${base64}`)
      ).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const preview = document.querySelector<HTMLCanvasElement>(
        '[data-testid="result-canvas"]',
      )!;
      const actual = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const expected = preview
        .getContext("2d")!
        .getImageData(0, 0, preview.width, preview.height).data;
      return (
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
      );
    }, bytes),
  ).toBe(true);

  await page
    .getByRole("button", { name: "Duplicate this text layer" })
    .last()
    .click();
  await expect(page.locator(".text-layer-row")).toHaveCount(3);
  for (const button of await page
    .getByRole("button", { name: "Duplicate this text layer" })
    .all()) {
    await expect(button).toBeDisabled();
  }
  await page
    .getByRole("button", { name: "Delete this text layer" })
    .last()
    .click();
  await expect(page.locator(".text-layer-row")).toHaveCount(2);
  revision = await getPreviewRevision(page);
  await page.getByRole("button", { name: "Reset edits" }).click();
  await waitForPreview(page, revision);
  await expect(page.locator(".preview-panel__title")).toHaveText(
    "sample-street.png",
  );
  await expect(page.locator(".text-box")).toHaveCount(0);
  await expect.poll(() => canvasesMatch(page)).toBe(true);
});

test("JPEG and WebP inputs decode; PNG alpha survives degradation and export", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(fixture("transparent.png"));
  await waitForPreview(page);
  for (const quality of [0, 50, 100]) {
    await setQuality(page, quality);
    const alpha = await page
      .getByTestId("result-canvas")
      .evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return {
          clear: pixels.some((value, index) => index % 4 === 3 && value === 0),
          visible: pixels.some((value, index) => index % 4 === 3 && value > 0),
        };
      });
    expect(alpha).toEqual({ clear: true, visible: true });
  }
  const pngDownload = page.waitForEvent("download");
  await page.getByTestId("download-disaster").click();
  const pngPath = testInfo.outputPath("transparent.png");
  await (await pngDownload).saveAs(pngPath);
  expect(
    await page.evaluate(async (base64) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      return context
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.some((value, index) => index % 4 === 3 && value === 0);
    }, readFileSync(pngPath).toString("base64")),
  ).toBe(true);

  for (const format of ["jpeg", "webp"] as const) {
    const encoded = await page
      .getByTestId("original-canvas")
      .evaluate(async (element, mime) => {
        const blob = await new Promise<Blob>((resolve) =>
          (element as HTMLCanvasElement).toBlob(
            (value) => resolve(value!),
            mime,
          ),
        );
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      }, `image/${format}`);
    await page.getByTestId("file-input").setInputFiles({
      name: `photo.${format}`,
      mimeType: `image/${format}`,
      buffer: Buffer.from(encoded),
    });
    await expect(page.locator(".preview-panel__title")).toHaveText(
      `photo.${format}`,
    );
    await waitForPreview(page);
    if (
      (await page
        .getByRole("slider", { name: "How bad should the image look" })
        .inputValue()) !== "0"
    ) {
      await setQuality(page, 0);
    }
    const signature = await canvasSignature(page, "original-canvas");
    expect(await canvasSignature(page, "result-canvas")).toBe(signature);
  }
});

test("every preset and advanced effect changes actual pixels", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loadSample(page);
  await setQuality(page, 0);
  const original = await canvasSignature(page, "result-canvas");
  const signatures = new Set<string>();
  for (const name of [
    "Slightly Cursed",
    "Crunchy JPEG",
    "Pixel Disaster",
    "Deep Fried",
    "Absolute Garbage",
  ]) {
    const previous = await getPreviewRevision(page);
    await page
      .locator(".preset-grid")
      .getByRole("button", { name: new RegExp(name, "i") })
      .click();
    await waitForPreview(page, previous);
    const signature = await canvasSignature(page, "result-canvas");
    expect(signature).not.toBe(original);
    signatures.add(signature);
  }
  expect(signatures.size).toBe(5);
  await page.getByRole("button", { name: "Open the knobs" }).click();
  for (const [effect, value] of [
    ["jpeg", 8],
    ["resolution", 10],
    ["pixelate", 70],
    ["noise", 75],
    ["colors", 4],
    ["contrast", 250],
    ["saturation", 0],
    ["sharpen", 100],
    ["glitch", 100],
  ] as const) {
    let previous = await getPreviewRevision(page);
    await page
      .locator(".preset-grid")
      .getByRole("button", { name: /^Original/ })
      .click();
    await waitForPreview(page, previous);
    previous = await getPreviewRevision(page);
    await page.locator(`#effect-${effect}`).fill(String(value));
    await waitForPreview(page, previous);
    expect(await canvasSignature(page, "result-canvas"), effect).not.toBe(
      original,
    );
  }
});

test("finite GIF playback stops, restarts, and preserves its loop count on export", async ({
  page,
}, testInfo) => {
  const encoder = GIFEncoder();
  for (let index = 0; index < 2; index += 1) {
    encoder.writeFrame(new Uint8Array(64 * 64).fill(index), 64, 64, {
      palette: [
        [255, 0, 0],
        [0, 0, 255],
      ],
      delay: 80,
      repeat: index === 0 ? 1 : -1,
    });
  }
  encoder.finish();
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "finite.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(encoder.bytes()),
  });
  await waitForPreview(page);
  await expect(page.locator(".playback-control__mode")).toHaveText("Paused");
  await expect(page.locator(".playback-control")).toContainText("2/2");
  await page.getByRole("button", { name: "Play animation" }).click();
  await expect(page.locator(".playback-control__mode")).toHaveText("Playing");
  await expect(page.locator(".playback-control__mode")).toHaveText("Paused");
  // Pure red/blue source has no white. White pixels in every exported patch
  // demonstrate that editable text is composited into each animation frame.
  let revision = await getPreviewRevision(page);
  await page
    .locator(".preset-grid")
    .getByRole("button", { name: /^Original/ })
    .click();
  await waitForPreview(page, revision);
  revision = await getPreviewRevision(page);
  await page.getByRole("switch", { name: "Enable text overlay" }).click();
  await waitForPreview(page, revision);
  revision = await getPreviewRevision(page);
  await page.locator("#text-layer-content").fill("OK");
  await waitForPreview(page, revision);
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download-disaster").click();
  const destination = testInfo.outputPath("finite.gif");
  await (await downloading).saveAs(destination);
  const bytes = readFileSync(destination);
  const marker = bytes.indexOf(Buffer.from("NETSCAPE2.0"));
  expect(marker).toBeGreaterThan(0);
  expect(bytes.readUInt16LE(marker + 13)).toBe(1);
  const parsed = parseGIF(Uint8Array.from(bytes).buffer);
  const frames = decompressFrames(parsed, true);
  expect(frames).toHaveLength(2);
  for (const frame of frames) {
    expect(
      frame.patch.some(
        (value, index) =>
          index % 4 === 0 &&
          value > 230 &&
          frame.patch[index + 1] > 230 &&
          frame.patch[index + 2] > 230,
      ),
    ).toBe(true);
  }
});
