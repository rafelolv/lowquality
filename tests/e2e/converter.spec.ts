import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "./helpers";

test("home uses one compact Toolbox entry instead of duplicate tool cards", async ({
  page,
}) => {
  await page.goto("/");
  const callout = page.locator("#tools");
  await expect(
    callout.getByRole("heading", { name: "Need a useful edit instead?" }),
  ).toBeVisible();
  await expect(callout.locator(".tool-card")).toHaveCount(0);
  const link = callout.getByRole("link", {
    name: "Explore all 9 tools",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "#toolbox");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await callout.scrollIntoViewIfNeeded();
    await expect(link).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
  }
  const footer = page.getByRole("navigation", { name: "Footer navigation" });
  await expect(footer.getByRole("link")).toHaveText([
    "Destroy",
    "Toolbox",
    "How It Works",
    "About",
  ]);
  await expect(page.locator(".site-footer button")).toHaveCount(0);
  await link.click();
  await expect(page.locator(".toolkit-cards .tool-card")).toHaveCount(9);
});

test.describe("image converter", () => {
  test("converts one image to multiple formats without touching the editor", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Toolbox", exact: true })
      .click();
    await page.getByTestId("toolbox-convert-card").click();
    const workbench = page.getByTestId("image-tools");
    await expect(page).toHaveURL(/#toolbox\/convert$/);
    await expect(
      page.getByRole("heading", { name: "Convert", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Clicking the dropzone itself must open the browser file picker.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await workbench.locator(".converter-drop").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(fixture("transparent.png"));

    const convert = workbench.getByTestId("converter-convert");
    await expect(convert).toBeEnabled({ timeout: 30_000 });
    await expect(workbench.getByTestId("converter-format-jpeg")).toBeEnabled();

    await workbench.getByTestId("converter-format-jpeg").click();
    const jpgDownloadPromise = page.waitForEvent("download");
    await convert.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const jpgDownload = await jpgDownloadPromise;
    expect(jpgDownload.suggestedFilename()).toBe("transparent.jpg");
    const jpgPath = testInfo.outputPath("transparent.jpg");
    await jpgDownload.saveAs(jpgPath);
    expect(Array.from(readFileSync(jpgPath).subarray(0, 3))).toEqual([
      0xff, 0xd8, 0xff,
    ]);
    await expect(workbench.getByRole("status")).toContainText(
      "transparent.jpg",
    );

    // The source stays loaded, so the same file can be converted again.
    await workbench.getByTestId("converter-format-webp").click();
    const webpDownloadPromise = page.waitForEvent("download");
    await convert.click();
    await expect(
      workbench.getByRole("button", { name: "Download result", exact: true }),
    ).toBeVisible();
    await workbench
      .getByRole("button", { name: "Download result", exact: true })
      .click();
    const webpDownload = await webpDownloadPromise;
    expect(webpDownload.suggestedFilename()).toBe("transparent.webp");
    const webpPath = testInfo.outputPath("transparent.webp");
    await webpDownload.saveAs(webpPath);
    expect(Array.from(readFileSync(webpPath).subarray(0, 4))).toEqual([
      0x52, 0x49, 0x46, 0x46,
    ]);
    await expect(workbench.getByRole("status")).toContainText(
      "transparent.webp",
    );

    // Converting never loads a session into the destructive editor.
    await expect(page.getByTestId("download-disaster")).toHaveCount(0);

    await expect(workbench.getByAltText("Processed result")).toBeVisible();
    await workbench
      .getByRole("button", { name: "Original", exact: true })
      .click();
    await expect(workbench.getByAltText("Original image")).toBeVisible();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Destroy", exact: true })
      .click();
    await expect(workbench).toHaveCount(0);
  });
});

test("direct routes recover from invalid input, keep SVG previews local, and support browser Back", async ({
  page,
  baseURL,
}) => {
  const remote: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL!).origin
    )
      remote.push(request.url());
  });
  await page.goto("/#toolbox/convert");
  const tool = page.getByTestId("image-tools");
  const input = tool.getByTestId("converter-file-input");
  await input.setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(0),
  });
  await expect(tool.getByRole("alert")).toContainText("empty");
  await input.setInputFiles({
    name: "local.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="60" height="80" fill="red"/><image href="https://example.com/never-request.png"/></svg>',
    ),
  });
  await expect(tool.getByTestId("converter-convert")).toBeEnabled();
  await expect(tool.getByRole("alert")).toHaveCount(0);
  await expect(tool.getByAltText("Original image")).toBeVisible();
  await page
    .getByRole("navigation", { name: "Toolbox navigation" })
    .getByRole("link", { name: "Compress", exact: true })
    .click();
  await expect(tool.getByTestId("compressor-compress")).toBeEnabled();
  await expect(tool).toContainText("local.svg");
  await page.goBack();
  await expect(page).toHaveURL(/#toolbox\/convert$/);
  await expect(tool.getByTestId("converter-convert")).toBeEnabled();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
  }
  expect(remote).toEqual([]);
});

test("cancel and route changes ignore late export results", async ({
  page,
}) => {
  // Hold actual worker exports until the user has cancelled or navigated away.
  await page.addInitScript(() => {
    const original = Worker.prototype.addEventListener;
    const held: (() => void)[] = [];
    Object.assign(window, {
      heldExports: () => held.length,
      releaseExports: () => held.splice(0).forEach((deliver) => deliver()),
    });
    Worker.prototype.addEventListener = function (
      this: Worker,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type !== "message" || typeof listener !== "function") {
        return original.call(this, type, listener, options);
      }
      return original.call(
        this,
        type,
        (event: Event) => {
          const deliver = () => listener.call(this, event);
          if ((event as MessageEvent).data.type === "export-blob")
            held.push(deliver);
          else deliver();
        },
        options,
      );
    };
  });
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.goto("/#toolbox/convert");
  const workbench = page.getByTestId("image-tools");
  await workbench
    .getByTestId("converter-file-input")
    .setInputFiles(fixture("transparent.png"));
  const convert = workbench.getByTestId("converter-convert");
  await expect(convert).toBeEnabled();
  for (const action of ["cancel", "navigate"]) {
    await convert.click();
    await expect.poll(() => page.evaluate("window.heldExports()")).toBe(1);
    if (action === "cancel")
      await workbench
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
    else
      await page
        .getByRole("navigation", { name: "Toolbox navigation" })
        .getByRole("link", { name: "Compress", exact: true })
        .click();
    await page.evaluate("window.releaseExports()");
    await expect(workbench.getByRole("status")).toHaveCount(0);
    await expect(
      workbench.getByTestId(
        action === "cancel" ? "converter-convert" : "compressor-compress",
      ),
    ).toBeEnabled();
    expect(downloads).toEqual([]);
  }
});

test("information sections remain reachable from the Toolbox", async ({
  page,
}) => {
  for (const navigation of ["Main navigation", "Footer navigation"]) {
    for (const [name, id] of [
      ["How It Works", "how-it-works"],
      ["About", "about"],
    ]) {
      await page.goto("/#toolbox/resize");
      await page
        .getByRole("navigation", { name: navigation })
        .getByRole("link", { name, exact: true })
        .click();
      await expect(page.locator(`#${id}`)).toBeInViewport();
      await expect(
        page
          .getByRole("navigation", { name: "Main navigation" })
          .getByRole("link", { name, exact: true }),
      ).toHaveAttribute("aria-current", "page");
    }
  }
});

test("browser history restores information sections after visiting Toolbox", async ({
  page,
}) => {
  await page.goto("/#about");
  await expect(page.locator("#about")).toBeInViewport();
  await page
    .getByRole("navigation", { name: "Footer navigation" })
    .getByRole("link", { name: "Toolbox", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "LowQuality Toolbox" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page.locator("#about")).toBeInViewport();
  await page.goForward();
  await expect(page).toHaveURL(/#toolbox$/);
});
