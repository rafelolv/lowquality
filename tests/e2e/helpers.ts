import { expect, type Page } from '@playwright/test';
import path from 'node:path';

const PREVIEW_TIMEOUT = 45_000;

export const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');

export function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

export async function getPreviewRevision(page: Page): Promise<string> {
  return (
    (await page.locator('.preview-panel').getAttribute('data-preview-revision')) ??
    'none'
  );
}

export async function settleFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Wait until the worker has delivered a preview newer than `previous`. */
export async function waitForPreview(
  page: Page,
  previous = 'none',
): Promise<string> {
  const panel = page.locator('.preview-panel');
  await expect(panel).toBeVisible({ timeout: PREVIEW_TIMEOUT });
  await expect
    .poll(() => getPreviewRevision(page), { timeout: PREVIEW_TIMEOUT })
    .not.toBe(previous);
  await settleFrames(page);
  return getPreviewRevision(page);
}

export async function loadSample(page: Page): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'No disaster loaded' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try sample image' }).click();
  await expect(page.getByTestId('download-disaster')).toBeEnabled({
    timeout: PREVIEW_TIMEOUT,
  });
  await waitForPreview(page);
}

export async function setQuality(page: Page, value: number): Promise<string> {
  const previous = await getPreviewRevision(page);
  await page
    .getByRole('slider', { name: 'How bad should the image look' })
    .fill(String(value));
  return waitForPreview(page, previous);
}

export async function uploadFixture(page: Page, name: string): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(fixture(name));
}

/** A 32-bit FNV-1a hash of the visible pixels, plus the canvas dimensions. */
export async function canvasSignature(page: Page, testId: string): Promise<string> {
  return page.getByTestId(testId).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width === 0 || canvas.height === 0) return 'empty';
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 1];
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 2];
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 3];
      hash = Math.imul(hash, 16777619);
    }
    return `${canvas.width}x${canvas.height}:${hash >>> 0}`;
  });
}

/** Compare the ORIGINAL and RESULT canvases byte-for-byte. */
export async function canvasesMatch(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const original = document.querySelector<HTMLCanvasElement>(
      '[data-testid="original-canvas"]',
    );
    const result = document.querySelector<HTMLCanvasElement>(
      '[data-testid="result-canvas"]',
    );
    if (!original || !result) return false;
    if (
      original.width !== result.width ||
      original.height !== result.height ||
      original.width === 0 ||
      original.height === 0
    ) {
      return false;
    }
    const originalContext = original.getContext('2d');
    const resultContext = result.getContext('2d');
    if (!originalContext || !resultContext) return false;
    const a = originalContext.getImageData(0, 0, original.width, original.height).data;
    const b = resultContext.getImageData(0, 0, result.width, result.height).data;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  });
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}
