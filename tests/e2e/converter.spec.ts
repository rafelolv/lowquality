import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

test("Convert and Compress are square feature cards on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(".tools-grid--features .tool-card");
  await expect(cards).toHaveCount(2);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await cards.first().scrollIntoViewIfNeeded();
    const dimensions = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      }),
    );
    for (const { width: cardWidth, height: cardHeight } of dimensions)
      expect(Math.abs(cardWidth - cardHeight)).toBeLessThanOrEqual(1);
  }

  await page.getByTestId("open-converter-card").click();
  await expect(page.getByTestId("converter-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("open-compressor-card").click();
  await expect(page.getByTestId("converter-dialog")).toBeVisible();
});

test.describe("image converter", () => {
  test("converts one image to multiple formats without touching the editor", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto("/");

    await page.getByTestId("open-converter").click();
    const dialog = page.getByTestId("converter-dialog");
    await expect(
      dialog.getByRole("heading", { name: "Just convert it." }),
    ).toBeVisible();
    await expect(dialog).not.toHaveClass(/converter-dialog--toolbox/);

    // Clicking the dropzone itself must open the browser file picker.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await dialog.locator(".converter-drop").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture("transparent.png"));

    const convert = dialog.getByTestId("converter-convert");
    await expect(convert).toBeEnabled({ timeout: 30_000 });
    await expect(dialog.getByTestId("converter-format-jpeg")).toBeEnabled();

    await dialog.getByTestId("converter-format-jpeg").click();
    const jpgDownloadPromise = page.waitForEvent("download");
    await convert.click();
    const jpgDownload = await jpgDownloadPromise;
    expect(jpgDownload.suggestedFilename()).toBe("transparent.jpg");
    const jpgPath = testInfo.outputPath("transparent.jpg");
    await jpgDownload.saveAs(jpgPath);
    expect(Array.from(readFileSync(jpgPath).subarray(0, 3))).toEqual([
      0xff, 0xd8, 0xff,
    ]);
    await expect(dialog.getByRole("status")).toContainText("transparent.jpg");

    // The source stays loaded, so the same file can be converted again.
    await dialog.getByTestId("converter-format-webp").click();
    const webpDownloadPromise = page.waitForEvent("download");
    await convert.click();
    const webpDownload = await webpDownloadPromise;
    expect(webpDownload.suggestedFilename()).toBe("transparent.webp");
    const webpPath = testInfo.outputPath("transparent.webp");
    await webpDownload.saveAs(webpPath);
    expect(Array.from(readFileSync(webpPath).subarray(0, 4))).toEqual([
      0x52, 0x49, 0x46, 0x46,
    ]);
    await expect(dialog.getByRole("status")).toContainText("transparent.webp");

    // The hidden converter never loads a session into the destructive editor.
    await expect(page.getByTestId("download-disaster")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});
