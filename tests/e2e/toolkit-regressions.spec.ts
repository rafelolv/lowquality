import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture } from "./helpers";

async function video(page: Page) {
  await page.goto("/#toolbox/video");
  await page
    .getByTestId("video-file-input")
    .setInputFiles(fixture("video-test.webm"));
  await expect(
    page.getByRole("button", { name: "Convert to GIF", exact: true }),
  ).toBeEnabled();
}
async function gifBytes(page: Page) {
  await expect(
    page.getByRole("region", { name: "GIF result", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GIF", exact: true }).click();
  return readFile((await (await download).path())!);
}
function navigation(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Toolbox navigation" })
    .getByRole("link", { name, exact: true });
}

test("video capture stays independent of source playback and keeps real GIF duration", async ({
  page,
}) => {
  await video(page);
  await page
    .getByLabel("Frames per second", { exact: true })
    .selectOption("12");
  await page
    .getByRole("button", { name: "Convert to GIF", exact: true })
    .click();
  const baseline = await gifBytes(page);
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const parsed = parseGIF(
    baseline.buffer.slice(
      baseline.byteOffset,
      baseline.byteOffset + baseline.byteLength,
    ) as ArrayBuffer,
  );
  const frames = decompressFrames(parsed, true);
  expect(frames).toHaveLength(18);
  expect(frames.reduce((total, frame) => total + frame.delay, 0)).toBe(1500);
  await page
    .getByRole("button", { name: "Convert to GIF", exact: true })
    .click();
  await page
    .getByLabel("Video preview", { exact: true })
    .evaluate((element) => {
      const source = element as HTMLVideoElement;
      source.currentTime = 0.9;
    });
  const changed = await gifBytes(page);
  const comparison = parseGIF(
    changed.buffer.slice(
      changed.byteOffset,
      changed.byteOffset + changed.byteLength,
    ) as ArrayBuffer,
  );
  const comparedFrames = decompressFrames(comparison, true);
  expect(comparedFrames).toHaveLength(frames.length);
  const differences = frames.map((frame, index) => {
    const pixels = comparedFrames[index].patch;
    return (
      frame.patch.reduce(
        (sum, value, position) => sum + Math.abs(value - pixels[position]),
        0,
      ) / frame.patch.length
    );
  });
  expect(differences).toEqual(Array(frames.length).fill(0));
  expect(
    await page
      .getByLabel("Video preview", { exact: true })
      .evaluate((element) => (element as HTMLVideoElement).currentTime),
  ).toBeCloseTo(0.9);
});

test("video cancel can immediately restart without stale errors or busy state", async ({
  page,
}) => {
  await video(page);
  const convert = page.getByRole("button", {
    name: "Convert to GIF",
    exact: true,
  });
  await convert.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(convert).toBeEnabled();
  await convert.click();
  const bytes = await gifBytes(page);
  expect(bytes.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(convert).toBeEnabled();
});

test("video trim can move beyond initial end and preview uses selected speed", async ({
  page,
}) => {
  await video(page);
  await page
    .getByLabel("Video preview", { exact: true })
    .evaluate((element) => {
      Object.defineProperty(element, "duration", {
        configurable: true,
        value: 90,
      });
      element.dispatchEvent(new Event("loadedmetadata"));
    });
  await page.getByLabel("Clip start", { exact: true }).fill("60");
  await expect(page.getByLabel("Clip start", { exact: true })).toHaveValue(
    "60",
  );
  await expect(page.getByLabel("Clip end", { exact: true })).toHaveValue(
    "60.1",
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("Clip start", { exact: true }).fill("0");
  await page.getByLabel("Playback speed", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Preview source clip", exact: true })
    .click();
  expect(
    await page
      .getByLabel("Video preview", { exact: true })
      .evaluate((element) => (element as HTMLVideoElement).playbackRate),
  ).toBe(2);
});

test("video worker errors release conversion and allow retry", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    let fail = true;
    Worker.prototype.postMessage = function (
      message: unknown,
      transfer?: Transferable[] | StructuredSerializeOptions,
    ) {
      if (fail && (message as { type: string }).type === "start") {
        fail = false;
        this.dispatchEvent(new Event("error"));
        return;
      }
      post.call(
        this,
        message,
        Array.isArray(transfer) ? { transfer } : transfer,
      );
    };
  });
  await video(page);
  const convert = page.getByRole("button", {
    name: "Convert to GIF",
    exact: true,
  });
  await convert.click();
  await expect(page.getByRole("alert")).toContainText("encoder stopped");
  await expect(convert).toBeEnabled();
  await convert.click();
  await gifBytes(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Batch invalidates old results when settings change and reprocesses queue", async ({
  page,
}) => {
  await page.goto("/#toolbox/batch");
  await page
    .getByLabel("Batch files", { exact: true })
    .setInputFiles(fixture("transparent.png"));
  await page
    .getByRole("button", { name: "Process queue", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Result", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Output format", { exact: true }).selectOption("png");
  await expect(
    page.getByRole("region", { name: "Result", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Download all (.zip)", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Resize width (0 = original)", { exact: true })
    .fill("80");
  await page
    .getByRole("button", { name: "Process queue", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Result", exact: true }),
  ).toContainText("PNG");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download result", exact: true })
    .click();
  const bytes = await readFile((await (await download).path())!);
  expect(bytes.readUInt32BE(16)).toBe(80);
  expect(bytes.readUInt32BE(20)).toBe(64);
});

test("GIF Kit rechecks shared sources instead of reusing static inspection", async ({
  page,
}) => {
  await page.goto("/#toolbox/resize");
  await page
    .getByLabel("Toolbox image", { exact: true })
    .setInputFiles(fixture("transparent.png"));
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await navigation(page, "GIF Kit").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Toolbox image", { exact: true })
    .setInputFiles(fixture("dance.gif"));
  await expect(page.getByAltText("Frame 1", { exact: true })).toBeVisible();
  await navigation(page, "Metadata").click();
  await expect(page.getByRole("alert")).toContainText(
    "GIF files belong in GIF Kit",
  );
  await page
    .getByLabel("Toolbox image", { exact: true })
    .setInputFiles(fixture("exif-gps.png"));
  await expect(page.getByText("Canon", { exact: true })).toBeVisible();
});

test("locked crop follows presets and source ratio survives output rotation", async ({
  page,
}) => {
  await page.goto("/#toolbox/resize");
  await page
    .getByLabel("Toolbox image", { exact: true })
    .setInputFiles(fixture("transparent.png"));
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Lock crop to output ratio", { exact: true }).check();
  await page
    .getByLabel("Social preset", { exact: true })
    .selectOption("Story / Reel");
  const ratio = async () =>
    Number(await page.getByLabel("Crop width", { exact: true }).inputValue()) /
    Number(await page.getByLabel("Crop height", { exact: true }).inputValue());
  expect(await ratio()).toBeCloseTo(9 / 16);
  await page.getByRole("button", { name: /Rotate 90/ }).click();
  expect(await ratio()).toBeCloseTo(9 / 16);
  await expect(page.getByLabel("Social preset", { exact: true })).toHaveValue(
    "Custom",
  );
});

test("Batch cancelled and abandoned ZIP jobs cannot trigger a late download", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    const held: (() => void)[] = [];
    Object.assign(window, {
      pendingZips: () => held.length,
      releaseZips: () => held.splice(0).forEach((deliver) => deliver()),
    });
    Worker.prototype.postMessage = function (
      message: unknown,
      transfer?: Transferable[] | StructuredSerializeOptions,
    ) {
      if ((message as { files?: unknown[] }).files) {
        const listener = this.onmessage;
        this.onmessage = (event) => {
          if (event.data.result) held.push(() => listener?.call(this, event));
          else listener?.call(this, event);
        };
      }
      post.call(
        this,
        message,
        Array.isArray(transfer) ? { transfer } : transfer,
      );
    };
  });
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.goto("/#toolbox/batch");
  await page
    .getByLabel("Batch files", { exact: true })
    .setInputFiles(fixture("transparent.png"));
  await page
    .getByRole("button", { name: "Process queue", exact: true })
    .click();
  const zip = page.getByRole("button", {
    name: "Download all (.zip)",
    exact: true,
  });
  await expect(zip).toBeEnabled();
  await zip.click();
  await expect.poll(() => page.evaluate("window.pendingZips()")).toBe(1);
  await page.getByRole("button", { name: "Cancel queue", exact: true }).click();
  await page.evaluate("window.releaseZips()");
  await expect(zip).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await zip.click();
  await expect.poll(() => page.evaluate("window.pendingZips()")).toBe(1);
  await navigation(page, "Resize & Crop").click();
  await page.evaluate("window.releaseZips()");
  await expect(
    page.getByRole("heading", { name: "Resize & Crop", exact: true }),
  ).toBeVisible();
  expect(downloads).toEqual([]);
});
