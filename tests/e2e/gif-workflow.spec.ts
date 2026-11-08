import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { decompressFrames, parseGIF } from 'gifuct-js';
import { uploadFixture, waitForPreview } from './helpers';

function arrayBufferOf(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function readNetscapeLoop(bytes: Buffer): number | null {
  const marker = bytes.indexOf(Buffer.from('NETSCAPE2.0', 'ascii'));
  if (marker < 0) return null;
  const blockSize = bytes[marker + 11];
  const blockId = bytes[marker + 12];
  if (blockSize !== 3 || blockId !== 1) return null;
  return bytes.readUInt16LE(marker + 13);
}

test.describe('animated GIF workflow', () => {
  test('loads every frame, preserves timing metadata and plays/pauses', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadFixture(page, 'dance.gif');
    await waitForPreview(page);

    const meta = page.locator('.preview-panel__meta');
    await expect(meta).toContainText('6 frames');
    await expect(meta).toContainText('1.1s');
    await expect(page.locator('.upload-card')).toContainText('6 frames');
    await expect(page.locator('.upload-card')).toContainText('animated');

    await expect(page.locator('.playback-control__mode')).toHaveText('Playing');
    await page.getByRole('button', { name: 'Pause animation' }).click();
    await expect(page.locator('.playback-control__mode')).toHaveText('Paused');
    await page.getByRole('button', { name: 'Play animation' }).click();
    await expect(page.locator('.playback-control__mode')).toHaveText('Playing');
    await expect(page.locator('.playback-control')).toContainText(/[1-6]\/6/);
  });

  test('labels a single-frame GIF without animation controls', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'still.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        'base64',
      ),
    });
    await waitForPreview(page);
    await expect(page.locator('.preview-panel__meta')).toContainText('1 frame');
    await expect(page.locator('.preview-panel__meta')).not.toContainText(
      '1 frames',
    );
    await expect(page.locator('.upload-card')).toContainText('1 frame');
    await expect(page.locator('.playback-control')).toHaveCount(0);
  });

  test('exports a GIF with all frames, delays and looping, plus a still PNG', async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await page.goto('/');
    await uploadFixture(page, 'dance.gif');
    await waitForPreview(page);

    await expect(page.getByTestId('format-gif')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const gifDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-disaster').click();
    const gifDownload = await gifDownloadPromise;
    expect(gifDownload.suggestedFilename()).toBe('lowquality-dance.gif');
    const gifPath = testInfo.outputPath('destroyed.gif');
    await gifDownload.saveAs(gifPath);

    const gifBytes = readFileSync(gifPath);
    expect(gifBytes.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/);
    expect(readNetscapeLoop(gifBytes)).toBe(0);

    const parsed = parseGIF(arrayBufferOf(gifBytes));
    const frames = decompressFrames(parsed, true);
    expect(frames).toHaveLength(6);
    expect(frames.map((frame) => frame.delay)).toEqual([
      80, 120, 160, 200, 240, 280,
    ]);

    await page.getByTestId('format-png').click();
    const pngDownloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-disaster').click();
    const pngDownload = await pngDownloadPromise;
    expect(pngDownload.suggestedFilename()).toBe('lowquality-dance.png');
    const pngPath = testInfo.outputPath('destroyed-first-frame.png');
    await pngDownload.saveAs(pngPath);
    const pngBytes = readFileSync(pngPath);
    expect(Array.from(pngBytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('offers safe scaling for oversized GIFs and loads the chosen size', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadFixture(page, 'large-parade.gif');
    await expect(
      page.getByRole('heading', { name: 'This GIF needs a diet.' }),
    ).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('2000 × 1000');
    await expect(dialog).toContainText('3 / 240');
    await expect(dialog.getByRole('radio')).toHaveCount(5);
    await expect(dialog).toContainText('80% · safest');

    await dialog
      .locator('.scale-option')
      .filter({ hasText: /1000 × 500/ })
      .click();
    await dialog.getByRole('button', { name: 'Shrink & continue' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitForPreview(page);

    await expect(page.locator('.preview-panel__meta')).toContainText('1,000 × 500');
    await expect(page.locator('.preview-panel__meta')).toContainText('3 frames');
    await expect(page.locator('.preview-panel__scaled')).toHaveText('Scaled');
    await expect(page.locator('.upload-card')).toContainText(
      'scaled from 2,000 × 1,000',
    );
  });

  test('Escape cancels the scaling prompt and keeps the empty workspace', async ({
    page,
  }) => {
    await page.goto('/');
    await uploadFixture(page, 'large-parade.gif');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'No disaster loaded' }),
    ).toBeVisible();
  });
});
