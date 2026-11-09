import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

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
