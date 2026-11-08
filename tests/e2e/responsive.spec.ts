import { expect, test } from "@playwright/test";
import { horizontalOverflow, loadSample, setQuality } from "./helpers";

const VIEWPORTS = [
  { width: 390, height: 844, name: "phone" },
  { width: 320, height: 700, name: "small phone" },
];

for (const viewport of VIEWPORTS) {
  test.describe(`responsive layout on a ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("empty state has no horizontal overflow", async ({ page }) => {
      await page.goto("/");
      await expect(page.locator(".empty-upload")).toBeVisible();
      await expect(page.locator(".empty-upload")).toBeInViewport({
        ratio: 1,
      });
      await expect(page.locator(".sample-demo")).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    });

    test("loaded editor stays usable without sideways scrolling", async ({
      page,
    }) => {
      await loadSample(page);
      await expect(page.getByTestId("result-canvas")).toBeInViewport();
      await expect(
        page.getByRole("slider", { name: "How bad should the image look" }),
      ).toBeInViewport();
      const initialSlider = await page.locator("#how-bad").boundingBox();
      const initialDock = await page.locator(".export-bar__dock").boundingBox();
      expect(initialSlider!.y + initialSlider!.height).toBeLessThan(
        initialDock!.y,
      );
      await setQuality(page, 75);
      await expect(page.getByTestId("result-canvas")).toBeVisible();
      await expect(page.getByTestId("download-disaster")).toBeVisible();
      await expect(
        page.getByRole("slider", { name: "How bad should the image look" }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

      const source = await page.locator(".editor-source").boundingBox();
      const preview = await page.locator(".preview-panel").boundingBox();
      const quality = await page.locator(".quality-panel").boundingBox();
      expect(source && preview && quality).toBeTruthy();
      expect(source!.y + source!.height).toBeLessThanOrEqual(preview!.y);
      expect(quality!.y - preview!.y - preview!.height).toBeLessThanOrEqual(16);
      const presets = await page.locator(".preset-panel").boundingBox();
      expect(presets!.height).toBeLessThan(350);

      await page.getByRole("button", { name: "Open the knobs" }).click();
      await page.locator("#effect-noise").scrollIntoViewIfNeeded();
      const download = await page
        .getByTestId("download-disaster")
        .boundingBox();
      expect(download!.y).toBeGreaterThan(0);
      expect(download!.y + download!.height).toBeLessThanOrEqual(
        viewport.height,
      );
      expect(download!.y + download!.height).toBeGreaterThan(
        viewport.height - 32,
      );

      // The dock must remain interactive while distant controls are in view.
      const downloading = page.waitForEvent("download");
      await page.getByTestId("download-disaster").click();
      expect((await downloading).suggestedFilename()).toBe(
        "lowquality-sample-street.png",
      );

      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(page.locator(".export-bar__dock")).toHaveCount(0);
      await expect(page.locator(".app")).not.toHaveClass(/app--editing/);
    });
  });
}

test.describe("small phone quality ticks", () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test("visible tick labels stay separated", async ({ page }) => {
    await loadSample(page);
    const labels = page.locator(".quality-tick__label:visible");
    await expect(labels).toHaveCount(4);
    const boxes = await labels.evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { left: rect.left, right: rect.right };
        })
        .sort((a, b) => a.left - b.left),
    );
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index]!.left).toBeGreaterThanOrEqual(
        boxes[index - 1]!.right - 1,
      );
    }
  });
});

test("desktop preview follows expanded controls without losing the main slider", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loadSample(page);
  const hero = await page.locator(".hero").boundingBox();
  expect(hero!.height).toBeLessThan(100);
  await page.getByRole("button", { name: "Open the knobs" }).click();
  await page.locator("#effect-noise").scrollIntoViewIfNeeded();
  const preview = await page.locator(".preview-panel").boundingBox();
  const slider = await page
    .getByRole("slider", { name: "How bad should the image look" })
    .boundingBox();
  expect(preview!.y).toBeGreaterThanOrEqual(0);
  expect(preview!.y).toBeLessThanOrEqual(24);
  expect(slider!.y + slider!.height).toBeLessThan(1000);
  await expect(page.getByTestId("download-disaster")).toBeInViewport();
});
