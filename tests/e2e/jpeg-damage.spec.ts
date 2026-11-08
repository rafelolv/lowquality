import { expect, test } from "@playwright/test";
import {
  canvasSignature,
  fixture,
  getPreviewRevision,
  loadSample,
  setQuality,
  waitForPreview,
} from "./helpers";

test("JPEG destruction stays separate from optional pixelation", async ({
  page,
}) => {
  await loadSample(page);
  await page.getByRole("button", { name: "Open the knobs" }).click();
  await setQuality(page, 100);
  await expect(page.locator("#effect-pixelate")).toHaveValue("1");
  const jpegOnly = await canvasSignature(page, "result-canvas");

  for (const preset of ["Deep Fried", "Absolute Garbage"]) {
    const previous = await getPreviewRevision(page);
    await page.getByRole("button", { name: new RegExp(preset, "i") }).click();
    await waitForPreview(page, previous);
    await expect(page.locator("#effect-pixelate")).toHaveValue("1");
  }

  let previous = await getPreviewRevision(page);
  await page.getByRole("button", { name: /Pixel Disaster/i }).click();
  await waitForPreview(page, previous);
  expect(
    Number(await page.locator("#effect-pixelate").inputValue()),
  ).toBeGreaterThan(1);
  expect(await canvasSignature(page, "result-canvas")).not.toBe(jpegOnly);

  previous = await getPreviewRevision(page);
  await page.locator("#effect-pixelate").fill("1");
  await waitForPreview(page, previous);
  await setQuality(page, 100);
  await expect(page.locator("#effect-pixelate")).toHaveValue("1");
});

test("JPEG generations accumulate visible damage without shifting alpha or dimensions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByTestId("file-input")
    .setInputFiles(fixture("transparent.png"));
  await waitForPreview(page);
  let previous = await getPreviewRevision(page);
  await page
    .locator(".preset-grid")
    .getByRole("button", { name: /^Original/ })
    .click();
  await waitForPreview(page, previous);
  const original = await canvasSignature(page, "result-canvas");
  await page.getByRole("button", { name: "Open the knobs" }).click();

  previous = await getPreviewRevision(page);
  await page.locator("#effect-jpeg").fill("18");
  await waitForPreview(page, previous);
  const single = await canvasSignature(page, "result-canvas");
  expect(single).not.toBe(original);

  previous = await getPreviewRevision(page);
  await page.locator("#effect-compressionLoops").fill("9");
  await waitForPreview(page, previous);
  expect(await canvasSignature(page, "result-canvas")).not.toBe(single);
  const alphaMatches = await page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>(
      '[data-testid="original-canvas"]',
    )!;
    const result = document.querySelector<HTMLCanvasElement>(
      '[data-testid="result-canvas"]',
    )!;
    if (source.width !== result.width || source.height !== result.height)
      return false;
    const a = source
      .getContext("2d")!
      .getImageData(0, 0, source.width, source.height).data;
    const b = result
      .getContext("2d")!
      .getImageData(0, 0, result.width, result.height).data;
    return a.every((value, index) => index % 4 !== 3 || b[index] === value);
  });
  expect(alphaMatches).toBe(true);

  previous = await getPreviewRevision(page);
  await page
    .getByRole("switch", { name: "Disable Repeated Compression" })
    .click();
  await waitForPreview(page, previous);
  expect(await canvasSignature(page, "result-canvas")).toBe(single);

  previous = await getPreviewRevision(page);
  await page.getByRole("switch", { name: "Disable JPEG Quality" }).click();
  await waitForPreview(page, previous);
  expect(await canvasSignature(page, "result-canvas")).toBe(original);
});
