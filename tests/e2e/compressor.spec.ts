import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SOURCE = path.join(
  process.cwd(),
  "public",
  "samples",
  "sample-destroyed.png",
);

test.describe("image compressor", () => {
  test("hits a target size and converts the same source to JPG", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto("/");

    await page.getByTestId("open-compressor").click();
    const workbench = page.getByTestId("image-tools");
    await expect(
      page.getByRole("heading", { name: "Compress", exact: true }),
    ).toBeVisible();

    // Clicking the dropzone itself must open the browser file picker.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await workbench.locator(".converter-drop").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(SOURCE);

    const compress = workbench.getByTestId("compressor-compress");
    await expect(compress).toBeEnabled({ timeout: 30_000 });
    await expect(workbench.getByTestId("compressor-format-webp")).toBeEnabled();

    const sourceSize = readFileSync(SOURCE).length;

    const webpDownloadPromise = page.waitForEvent("download");
    await compress.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const webpDownload = await webpDownloadPromise;
    expect(webpDownload.suggestedFilename()).toBe(
      "sample-destroyed-compressed.webp",
    );
    const webpPath = testInfo.outputPath("sample-destroyed-compressed.webp");
    await webpDownload.saveAs(webpPath);
    const webp = readFileSync(webpPath);
    expect(Array.from(webp.subarray(0, 4))).toEqual([0x52, 0x49, 0x46, 0x46]);
    expect(webp.length).toBeLessThan(sourceSize);

    const result = workbench.getByTestId("compressor-result");
    await expect(result).toContainText("% smaller");
    await expect(result).toContainText("WebP");
    await expect(result).toContainText("quality");

    // The source stays loaded, so the same file can be compressed again.
    await workbench.getByTestId("compressor-format-jpeg").click();
    const jpgDownloadPromise = page.waitForEvent("download");
    await compress.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const jpgDownload = await jpgDownloadPromise;
    expect(jpgDownload.suggestedFilename()).toBe(
      "sample-destroyed-compressed.jpg",
    );
    const jpgPath = testInfo.outputPath("sample-destroyed-compressed.jpg");
    await jpgDownload.saveAs(jpgPath);
    const jpg = readFileSync(jpgPath);
    expect(Array.from(jpg.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(jpg.length).toBeLessThan(sourceSize);

    // Switching routes keeps the loaded source, and the editor stays untouched.
    await page
      .getByRole("navigation", { name: "Toolbox navigation" })
      .getByRole("link", { name: "Convert", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Convert", exact: true }),
    ).toBeVisible();
    await expect(workbench.getByTestId("converter-convert")).toBeEnabled();
    await expect(page.getByTestId("download-disaster")).toHaveCount(0);

    await page.goto("/#toolbox");
    await expect(workbench).toHaveCount(0);
  });

  test("honors a custom target and refuses impossible sizes", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto("/");

    await page.getByTestId("open-compressor").click();
    const workbench = page.getByTestId("image-tools");
    const chooserPromise = page.waitForEvent("filechooser");
    await workbench.locator(".converter-drop").click();
    const chooser = await chooserPromise;
    await chooser.setFiles(SOURCE);

    const compress = workbench.getByTestId("compressor-compress");
    await expect(compress).toBeEnabled({ timeout: 30_000 });

    const custom = workbench.getByTestId("compressor-custom-target");
    await custom.fill("999");
    await expect(compress).toBeDisabled();
    await expect(workbench.getByTestId("compressor-custom-hint")).toContainText(
      "below the original",
    );

    const targetBytes = 12 * 1024;
    await custom.fill(String(targetBytes / (1024 * 1024)));
    await expect(compress).toBeEnabled();
    await expect(workbench.getByTestId("compressor-custom-hint")).toContainText(
      "12 KB target",
    );

    const downloadPromise = page.waitForEvent("download");
    await compress.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const download = await downloadPromise;
    const outputPath = testInfo.outputPath("custom-target.webp");
    await download.saveAs(outputPath);
    const output = readFileSync(outputPath);
    expect(output.length).toBeLessThanOrEqual(targetBytes);
    await expect(workbench.getByTestId("compressor-result")).toContainText(
      "tries",
    );

    await page.goto("/#toolbox");
    await expect(workbench).toHaveCount(0);
  });

  test("applies a resolution cap and never drops below the quality floor", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto("/");

    const dataUrl = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1200;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No canvas context");
      const gradient = context.createLinearGradient(0, 0, 1600, 1200);
      gradient.addColorStop(0, "#ff2d55");
      gradient.addColorStop(0.4, "#ffcc29");
      gradient.addColorStop(0.7, "#72f0a8");
      gradient.addColorStop(1, "#6f4bff");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1600, 1200);
      for (let index = 0; index < 120; index += 1) {
        context.globalAlpha = 0.2;
        context.fillStyle = index % 2 ? "#170b2b" : "#fff4d6";
        context.beginPath();
        context.arc(
          80 + ((index * 137) % 1440),
          80 + ((index * 211) % 1040),
          20 + ((index * 37) % 120),
          0,
          Math.PI * 2,
        );
        context.fill();
      }
      return canvas.toDataURL("image/png");
    });

    await page.getByTestId("open-compressor").click();
    const workbench = page.getByTestId("image-tools");
    await workbench.getByTestId("converter-file-input").setInputFiles({
      name: "gradient-source.png",
      mimeType: "image/png",
      buffer: Buffer.from(dataUrl.split(",")[1] ?? "", "base64"),
    });

    const compress = workbench.getByTestId("compressor-compress");
    await expect(compress).toBeEnabled({ timeout: 30_000 });

    await workbench.locator(".converter-advanced summary").click();
    await workbench.getByTestId("compressor-dimension-1280").click();
    const targetBytes = 60 * 1024;
    await workbench
      .getByTestId("compressor-custom-target")
      .fill(String(targetBytes / (1024 * 1024)));
    await workbench
      .getByTestId("compressor-quality-floor")
      .evaluate((element) => {
        const input = element as HTMLInputElement;
        input.value = "60";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });

    const downloadPromise = page.waitForEvent("download");
    await compress.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const download = await downloadPromise;
    const outputPath = testInfo.outputPath("capped.webp");
    await download.saveAs(outputPath);
    expect(readFileSync(outputPath).length).toBeLessThanOrEqual(targetBytes);

    const result = workbench.getByTestId("compressor-result");
    await expect(result).toContainText("1,280 × 960");
    const resultText = await result.innerText();
    const quality = Number(resultText.match(/quality\s+(\d+)%/)?.[1] ?? 0);
    expect(quality).toBeGreaterThanOrEqual(60);

    await page.goto("/#toolbox");
    await expect(workbench).toHaveCount(0);
  });
});
