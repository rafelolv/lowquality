import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fixture, horizontalOverflow } from "./helpers";
test("all Toolbox tools use the shared raised work surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, title] of [
    ["convert", "Convert"],
    ["compress", "Compress"],
    ["resize", "Resize & Crop"],
    ["batch", "Batch"],
    ["metadata", "Metadata"],
    ["favicon", "Favicon"],
    ["redact", "Redact"],
    ["gif", "GIF Kit"],
    ["video", "Video to GIF"],
  ]) {
    await page.goto(`/#toolbox/${route}`);
    const shell = page.locator(".toolkit-tool-shell");
    await expect(shell).toBeVisible();
    await expect(
      shell.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    const style = await shell.evaluate((element) => {
      const { backgroundColor, borderTopWidth, borderRadius, boxShadow } =
        getComputedStyle(element);
      return { backgroundColor, borderTopWidth, borderRadius, boxShadow };
    });
    expect(style.backgroundColor).toBe("rgb(53, 27, 96)");
    expect(style.borderTopWidth).toBe("3px");
    expect(style.borderRadius).toBe("4px");
    expect(style.boxShadow).toContain("6px 6px");
    expect(await horizontalOverflow(page)).toBe(0);
  }
});

test("Convert and Compress are purple feature cards in the Toolbox grid", async ({
  page,
}) => {
  await page.goto("/#toolbox");
  await expect(page.locator(".toolkit-cards .tool-card")).toHaveCount(9);

  for (const testId of ["toolbox-convert-card", "toolbox-compress-card"]) {
    const card = page.getByTestId(testId);
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/panel/);
    await expect(card).toHaveClass(/tool-card/);
  }

  for (const tool of ["convert", "compress"]) {
    await page.getByTestId(`toolbox-${tool}-card`).click();
    await expect(page).toHaveURL(new RegExp(`#toolbox/${tool}$`));
    await expect(page.getByTestId("image-tools")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator(".toolkit-back").click();
  }
});

async function upload(
  page: import("@playwright/test").Page,
  file = "transparent.png",
) {
  await page
    .getByLabel("Toolbox image", { exact: true })
    .setInputFiles(fixture(file));
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
}
async function resultBytes(page: import("@playwright/test").Page) {
  await expect(
    page.getByRole("region", { name: "Result", exact: true }),
  ).toBeVisible();
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download result", exact: true })
    .click();
  const download = await event;
  return readFile((await download.path())!);
}
function collectErrors(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}
test("resize exports exact dimensions; shared file survives tabs; mobile fits", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/#toolbox/resize");
  await expect(page.locator(".site-header")).toBeInViewport();
  await upload(page);
  await page.getByLabel("Lock output proportions").uncheck();
  await page.getByLabel("Width", { exact: true }).fill("80");
  await page.getByLabel("Height", { exact: true }).fill("60");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const bytes = await resultBytes(page);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.readUInt32BE(16)).toBe(80);
  expect(bytes.readUInt32BE(20)).toBe(60);
  await page
    .getByRole("navigation", { name: "Toolbox navigation" })
    .getByRole("link", { name: "Metadata", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBe(0);
  await page
    .getByRole("navigation", { name: "Toolbox navigation" })
    .getByRole("link", { name: "Resize & Crop", exact: true })
    .click();
  await page.getByLabel("Width", { exact: true }).fill("1600");
  await page.getByLabel("Height", { exact: true }).fill("900");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Result", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".toolkit-output")
      .evaluate((element) => element.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(390);
  expect(await horizontalOverflow(page)).toBe(0);
  expect(errors).toEqual([]);
});
test("batch writes sanitized collision-free ZIP", async ({ page }) => {
  await page.goto("/#toolbox/batch");
  await page
    .getByLabel("Batch files")
    .setInputFiles([fixture("transparent.png"), fixture("transparent.png")]);
  await page
    .getByRole("button", { name: "Process queue", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Download all (.zip)", exact: true }),
  ).toBeEnabled({ timeout: 30000 });
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all (.zip)", exact: true })
    .click();
  const bytes = await readFile((await (await event).path())!);
  expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
  expect(bytes.readUInt16LE(bytes.length - 14)).toBe(2);
  expect(bytes.includes(Buffer.from("transparent-batch.webp"))).toBe(true);
  expect(bytes.includes(Buffer.from("transparent-batch-2.webp"))).toBe(true);
});

test("metadata reads EXIF/GPS then exports a clean oriented PNG", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/#toolbox/metadata");
  await upload(page, "exif-gps.png");
  await expect(page.getByText("Canon", { exact: true })).toBeVisible();
  await expect(page.getByText("-23.55", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const bytes = await resultBytes(page);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.includes(Buffer.from("eXIf"))).toBe(false);
  expect(bytes.includes(Buffer.from("Canon"))).toBe(false);
  await expect(
    page.getByText("No common EXIF/GPS fields detected in the reencoded file."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("favicon exports six PNGs, multi-size ICO, manifest and HTML", async ({
  page,
}) => {
  await page.goto("/#toolbox/favicon");
  await upload(page);
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const bytes = await resultBytes(page);
  expect(bytes.readUInt16LE(bytes.length - 14)).toBe(9);
  for (const name of [
    "icon-16.png",
    "icon-32.png",
    "icon-48.png",
    "icon-180.png",
    "icon-192.png",
    "icon-512.png",
    "favicon.ico",
    "manifest.webmanifest",
    "README.txt",
  ])
    expect(bytes.includes(Buffer.from(name))).toBe(true);
  await expect(page.getByAltText("16px icon", { exact: true })).toBeVisible();
});

test("redact changes exported pixels; supports rectangle controls and blur", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/#toolbox/redact");
  await upload(page);
  await page.getByLabel("Rectangle width", { exact: true }).fill("100");
  await page.getByLabel("Rectangle height", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await resultBytes(page);
  const changed = await page.evaluate(async () => {
    const source = document.querySelector<HTMLImageElement>(
        ".toolkit-image > img",
      )!,
      result = document.querySelector<HTMLImageElement>(".toolkit-output")!;
    await result.decode();
    const a = document.createElement("canvas"),
      b = document.createElement("canvas");
    a.width = b.width = result.naturalWidth;
    a.height = b.height = result.naturalHeight;
    const ca = a.getContext("2d")!,
      cb = b.getContext("2d")!;
    ca.drawImage(source, 0, 0, a.width, a.height);
    cb.drawImage(result, 0, 0);
    const pixelsA = ca.getImageData(0, 0, 100, 100).data,
      pixelsB = cb.getImageData(0, 0, 100, 100).data;
    return pixelsA.some((value, i) => value !== pixelsB[i]);
  });
  expect(changed).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Remove rectangle 1/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Add rectangle", exact: true })
    .click();
  await page.getByLabel("Redaction mode", { exact: true }).selectOption("blur");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await resultBytes(page);
  expect(errors).toEqual([]);
});

test("GIF Kit preserves loop, timings, frame order; reverses, changes speed, extracts", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/#toolbox/gif");
  await upload(page, "dance.gif");
  await expect(page.getByAltText("Frame 1", { exact: true })).toBeVisible();
  await page.getByLabel("GIF quality", { exact: true }).fill("100");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const original = await resultBytes(page);
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const parse = (buffer: Buffer) =>
    parseGIF(
      buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.length,
      ) as ArrayBuffer,
    );
  const input = parse(await readFile(fixture("dance.gif"))),
    output = parse(original);
  expect(output.lsd.width).toBe(input.lsd.width);
  expect(output.lsd.height).toBe(input.lsd.height);
  const extractGifLoopCount = (parsed: ReturnType<typeof parseGIF>) => {
    for (const frame of parsed.frames) {
      if ("application" in frame && frame.application.id === "NETSCAPE2.0") {
        const blocks = frame.application.blocks;
        return Number(blocks[1]) | (Number(blocks[2]) << 8);
      }
    }
    return -1;
  };
  expect(extractGifLoopCount(output)).toBe(extractGifLoopCount(input));
  const outputFrames = decompressFrames(output, true),
    inputFrames = decompressFrames(input, true);
  expect(outputFrames.map((frame) => frame.delay)).toEqual(
    inputFrames.map((frame) => frame.delay),
  );
  await page.getByLabel("Reverse frames", { exact: true }).check();
  await page.getByLabel("Speed", { exact: true }).selectOption("2");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const reversed = parse(await resultBytes(page));
  const reversedFrames = decompressFrames(reversed, true);
  expect(reversedFrames.map((frame) => frame.delay)).toEqual(
    [...outputFrames]
      .reverse()
      .map((frame) => Math.max(20, Math.round(frame.delay / 2 / 10) * 10)),
  );
  expect(reversedFrames[0].patch).toEqual(outputFrames.at(-1)!.patch);
  await page
    .getByRole("button", { name: "Extract frames (.zip)", exact: true })
    .click();
  const archive = await resultBytes(page);
  expect(archive.readUInt16LE(archive.length - 14)).toBe(inputFrames.length);
  expect(archive.includes(Buffer.from("frame-0001.png"))).toBe(true);
  expect(errors).toEqual([]);
});

test("Video to GIF trims, samples, and exports local motion", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/#toolbox/video");
  await page.getByTestId("video-file-input").setInputFiles({
    name: "legacy.avi",
    mimeType: "video/x-msvideo",
    buffer: Buffer.from("RIFF0000AVI "),
  });
  await expect(page.getByRole("alert")).toContainText(/desktop transcoder/);

  await page
    .getByTestId("video-file-input")
    .setInputFiles(fixture("video-test.webm"));
  await expect(
    page.getByRole("group", { name: "GIF output plan" }),
  ).toContainText("18");
  await expect(
    page.getByRole("button", { name: "Convert to GIF", exact: true }),
  ).toBeEnabled({ timeout: 20_000 });

  await page.getByLabel("Clip end", { exact: true }).fill("1");
  await page
    .getByLabel("Frames per second", { exact: true })
    .selectOption("10");
  await page.getByLabel("Palette colors", { exact: true }).selectOption("64");
  await page.getByLabel("Reverse frames", { exact: true }).check();
  await page
    .getByRole("button", { name: "Convert to GIF", exact: true })
    .click();

  await expect(
    page.getByRole("region", { name: "GIF result", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByAltText("Converted GIF preview")).toBeVisible();
  await expect(page.getByRole("region", { name: "GIF result" })).toContainText(
    "160 × 90px",
  );
  await expect(page.getByRole("region", { name: "GIF result" })).toContainText(
    "10 frames",
  );

  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download GIF", exact: true }).click();
  const bytes = await readFile((await (await event).path())!);
  expect(bytes.subarray(0, 6).toString()).toMatch(/^GIF8[79]a$/);
  const { parseGIF, decompressFrames } = await import("gifuct-js");
  const parsed = parseGIF(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.length,
    ) as ArrayBuffer,
  );
  expect(parsed.lsd.width).toBe(160);
  expect(parsed.lsd.height).toBe(90);
  expect(decompressFrames(parsed, true)).toHaveLength(10);
  expect(errors).toEqual([]);
});

test("SVG stays local; exports JPG/WebP with real dimensions; mobile tools fit", async ({
  page,
  baseURL,
}) => {
  const remote: string[] = [];
  const errors = collectErrors(page);
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL!).origin
    )
      remote.push(request.url());
  });
  await page.goto("/#toolbox/resize");
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByLabel("Toolbox image", { exact: true }).click();
  await (
    await chooserEvent
  ).setFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="60" height="80" fill="red"/><image href="https://example.com/never-request.png"/></svg>',
    ),
  });
  await expect(
    page.getByRole("button", { name: "Process image", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("Output format", { exact: true }).selectOption("jpeg");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const jpeg = await resultBytes(page);
  expect(jpeg.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  const matte = await page
    .getByAltText("Processed result", { exact: true })
    .evaluate(async (image) => {
      const element = image as HTMLImageElement;
      await element.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(element, 0, 0);
      return [...ctx.getImageData(100, 40, 1, 1).data];
    });
  expect(matte).toEqual([255, 255, 255, 255]);
  await page.getByLabel("Output format", { exact: true }).selectOption("webp");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const webp = await resultBytes(page);
  expect(webp.subarray(0, 4).toString()).toBe("RIFF");
  expect(webp.subarray(8, 12).toString()).toBe("WEBP");
  const alpha = await page
    .getByAltText("Processed result", { exact: true })
    .evaluate(async (image) => {
      const element = image as HTMLImageElement;
      await element.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(element, 0, 0);
      return ctx.getImageData(100, 40, 1, 1).data[3];
    });
  expect(alpha).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const tool of [
    "Resize & Crop",
    "Metadata",
    "Favicon",
    "Redact",
    "GIF Kit",
    "Video to GIF",
    "Batch",
  ]) {
    await page
      .getByRole("navigation", { name: "Toolbox navigation" })
      .getByRole("link", { name: tool, exact: true })
      .click();
    expect(await horizontalOverflow(page)).toBe(0);
  }
  expect(remote).toEqual([]);
  expect(errors).toEqual([]);
});

test("JPEG metadata removal respects EXIF orientation", async ({ page }) => {
  await page.goto("/#toolbox/metadata");
  const jpeg = Buffer.from(
    await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 120;
      c.height = 80;
      c.getContext("2d")!.fillRect(0, 0, 60, 80);
      const blob = await new Promise<Blob>((resolve) =>
        c.toBlob((value) => resolve(value!), "image/jpeg"),
      );
      return [...new Uint8Array(await blob.arrayBuffer())];
    }),
  );
  const png = await readFile(fixture("exif-gps.png"));
  const exifSize = png.readUInt32BE(33),
    tiff = png.subarray(41, 41 + exifSize);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(tiff.length + 8);
  const tagged = Buffer.concat([
    jpeg.subarray(0, 2),
    Buffer.from([255, 225]),
    length,
    Buffer.from("Exif\0\0"),
    tiff,
    jpeg.subarray(2),
  ]);
  await page.getByLabel("Toolbox image", { exact: true }).setInputFiles({
    name: "oriented.jpg",
    mimeType: "image/jpeg",
    buffer: tagged,
  });
  await expect(page.getByText("Canon", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const output = await resultBytes(page);
  expect(output.readUInt32BE(16)).toBe(80);
  expect(output.readUInt32BE(20)).toBe(120);
  expect(output.includes(Buffer.from("Canon"))).toBe(false);
});

test("crop handles work with mouse and touch; reset and social presets remain usable", async ({
  page,
}) => {
  await page.goto("/#toolbox/resize");
  await upload(page);
  const image = page.locator(".toolkit-image");
  await image.scrollIntoViewIfNeeded();
  const box = (await image.boundingBox())!;
  const handle = (await page.locator(".toolkit-handle--se").boundingBox())!;
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.up();
  await expect(page.getByLabel("Crop y", { exact: true })).toHaveValue("0");
  const width = Number(
    await page.getByLabel("Crop width", { exact: true }).inputValue(),
  );
  const height = Number(
    await page.getByLabel("Crop height", { exact: true }).inputValue(),
  );
  expect(width).toBeGreaterThan(95);
  expect(width).toBeLessThan(105);
  expect(height).toBeGreaterThan(75);
  expect(height).toBeLessThan(85);
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  await image.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const handle = element.querySelector(".toolkit-handle--se")!;
    // Synthetic pointer events exercise the same touch-specific event path.
    const capture = element.setPointerCapture;
    element.setPointerCapture = () => {};
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 7,
        clientX: box.right - 2,
        clientY: box.bottom - 2,
      }),
    );
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 7,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      }),
    );
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerType: "touch",
        pointerId: 7,
        clientX: box.x + box.width / 2,
        clientY: box.y + box.height / 2,
      }),
    );
    element.setPointerCapture = capture;
  });
  await expect(page.getByLabel("Crop y", { exact: true })).toHaveValue("0");
  expect(
    Number(await page.getByLabel("Crop width", { exact: true }).inputValue()),
  ).toBeLessThan(105);
  await page
    .getByLabel("Social preset", { exact: true })
    .selectOption("Story / Reel");
  await expect(page.getByLabel("Width", { exact: true })).toHaveValue("1080");
  await expect(page.getByLabel("Height", { exact: true })).toHaveValue("1920");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  const output = await resultBytes(page);
  expect(output.readUInt32BE(16)).toBe(1080);
  expect(output.readUInt32BE(20)).toBe(1920);
});

test("toolbox processing preserves the destruction editor session", async ({
  page,
}) => {
  const { loadSample, canvasSignature } = await import("./helpers");
  await loadSample(page);
  const before = await canvasSignature(page, "original-canvas");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Toolbox", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Toolbox navigation" })
    .getByRole("link", { name: "Resize & Crop", exact: true })
    .click();
  await upload(page);
  await page.getByLabel("Width", { exact: true }).fill("80");
  await page
    .getByRole("button", { name: "Process image", exact: true })
    .click();
  await resultBytes(page);
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Editor", exact: true })
    .click();
  expect(await canvasSignature(page, "original-canvas")).toBe(before);
  await expect(page.getByTestId("download-disaster")).toBeEnabled();
});
