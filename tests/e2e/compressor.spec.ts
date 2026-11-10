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
    const dialog = page.getByTestId("converter-dialog");
    await expect(
      dialog.getByRole("heading", { name: "Squeeze it gently." }),
    ).toBeVisible();

    // Clicking the dropzone itself must open the browser file picker.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await dialog.locator(".converter-drop").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(SOURCE);

    const compress = dialog.getByTestId("compressor-compress");
    await expect(compress).toBeEnabled({ timeout: 30_000 });
    await expect(dialog.getByTestId("compressor-format-webp")).toBeEnabled();

    const sourceSize = readFileSync(SOURCE).length;

    const webpDownloadPromise = page.waitForEvent("download");
    await compress.click();
    const webpDownload = await webpDownloadPromise;
    expect(webpDownload.suggestedFilename()).toBe(
      "sample-destroyed-compressed.webp",
    );
    const webpPath = testInfo.outputPath("sample-destroyed-compressed.webp");
    await webpDownload.saveAs(webpPath);
    const webp = readFileSync(webpPath);
    expect(Array.from(webp.subarray(0, 4))).toEqual([
      0x52, 0x49, 0x46, 0x46,
    ]);
    expect(webp.length).toBeLessThan(sourceSize);

    const result = dialog.getByTestId("compressor-result");
    await expect(result).toContainText("% smaller");
    await expect(result).toContainText("WebP");
    await expect(result).toContainText("quality");

    // The source stays loaded, so the same file can be compressed again.
    await dialog.getByTestId("compressor-format-jpeg").click();
    const jpgDownloadPromise = page.waitForEvent("download");
    await compress.click();
    const jpgDownload = await jpgDownloadPromise;
    expect(jpgDownload.suggestedFilename()).toBe(
      "sample-destroyed-compressed.jpg",
    );
    const jpgPath = testInfo.outputPath("sample-destroyed-compressed.jpg");
    await jpgDownload.saveAs(jpgPath);
    const jpg = readFileSync(jpgPath);
    expect(Array.from(jpg.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    expect(jpg.length).toBeLessThan(sourceSize);

    // Switching tabs keeps the loaded source, and the editor stays untouched.
    await dialog.getByTestId("tool-tab-convert").click();
    await expect(
      dialog.getByRole("heading", { name: "Just convert it." }),
    ).toBeVisible();
    await expect(dialog.getByTestId("converter-convert")).toBeEnabled();
    await expect(page.getByTestId("download-disaster")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
