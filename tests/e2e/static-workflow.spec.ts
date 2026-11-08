import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  canvasSignature,
  canvasesMatch,
  getPreviewRevision,
  loadSample,
  setQuality,
  settleFrames,
  waitForPreview,
} from './helpers';

test.describe('static image workflow', () => {
  test('quality 0 is pixel-identical, 50 is damaged and 100 is destroyed', async ({
    page,
  }) => {
    await loadSample(page);

    const original = await canvasSignature(page, 'original-canvas');
    expect(original).not.toBe('empty');

    await setQuality(page, 0);
    await expect(page.locator('.quality-readout')).toHaveText(/Intact/);
    await expect(page.locator('.quality-panel__descriptor')).toHaveText('Original');
    await expect.poll(() => canvasesMatch(page), { timeout: 20_000 }).toBe(true);
    const zero = await canvasSignature(page, 'result-canvas');

    await setQuality(page, 50);
    await expect(page.locator('.quality-readout')).toHaveText('50 / 100');
    await settleFrames(page);
    const fifty = await canvasSignature(page, 'result-canvas');
    expect(fifty).not.toBe(zero);
    expect(fifty).not.toBe(original);

    await setQuality(page, 100);
    await expect(page.locator('.quality-readout')).toHaveText('100 / 100');
    await expect(page.locator('.quality-panel__descriptor')).toHaveText(
      'Absolute garbage',
    );
    await settleFrames(page);
    const hundred = await canvasSignature(page, 'result-canvas');
    expect(hundred).not.toBe(zero);
    expect(hundred).not.toBe(fifty);
    await expect.poll(() => canvasesMatch(page), { timeout: 20_000 }).toBe(false);
  });

  test('presets reset overrides, while manual values survive slider moves', async ({
    page,
  }) => {
    await loadSample(page);
    const slider = page.getByRole('slider', { name: 'How bad should the image look' });

    let previous = await getPreviewRevision(page);
    await page.getByRole('button', { name: /Absolute Garbage/i }).click();
    await waitForPreview(page, previous);
    await expect(slider).toHaveValue('100');
    await expect(page.locator('.quality-panel__descriptor')).toHaveText(
      'Absolute garbage',
    );

    await page.getByRole('button', { name: 'Open the knobs' }).click();
    await expect(page.getByRole('slider', { name: /JPEG Quality/ })).toBeVisible();

    previous = await getPreviewRevision(page);
    await page.locator('#effect-jpeg').fill('12');
    await waitForPreview(page, previous);
    await expect(page.locator('#effect-jpeg')).toHaveValue('12');
    await expect(page.locator('.advanced-panel__meta')).toContainText('1 custom');

    await setQuality(page, 30);
    await expect(slider).toHaveValue('30');
    await expect(page.locator('#effect-jpeg')).toHaveValue('12');
    await expect(page.locator('.advanced-panel__meta')).toContainText('1 custom');

    previous = await getPreviewRevision(page);
    await page.getByRole('switch', { name: 'Disable JPEG Quality' }).click();
    await waitForPreview(page, previous);
    await expect(page.locator('#effect-jpeg')).toBeDisabled();
    await expect(page.locator('.advanced-panel__meta')).toContainText('9/10 on');

    previous = await getPreviewRevision(page);
    await page.getByRole('button', { name: /Slightly Cursed/i }).click();
    await waitForPreview(page, previous);
    await expect(slider).toHaveValue('25');
    await expect(page.locator('.quality-panel__descriptor')).toHaveText(
      'Slightly cursed',
    );
    await expect(page.locator('.advanced-panel__meta')).not.toContainText('custom');
    await expect(page.locator('.advanced-panel__meta')).toContainText('10/10 on');
    await expect(page.locator('#effect-jpeg')).toBeEnabled();
    await expect(page.locator('#effect-jpeg')).not.toHaveValue('12');
    await expect(page.getByRole('button', { name: /Reset all/i })).toBeDisabled();
  });

  test('text is burned into the pixels before degradation', async ({ page }) => {
    await loadSample(page);
    const beforeText = await canvasSignature(page, 'result-canvas');

    let previous = await getPreviewRevision(page);
    await page.getByRole('switch', { name: 'Enable text overlay' }).click();
    await waitForPreview(page, previous);
    await expect(page.locator('.text-box')).toBeVisible();
    await expect(page.locator('.text-box')).toHaveAccessibleName(
      /MAKE IT WORSE/,
    );
    const defaultText = await canvasSignature(page, 'result-canvas');
    expect(defaultText).not.toBe(beforeText);

    previous = await getPreviewRevision(page);
    await page.locator('#text-layer-content').fill('TOTALLY CURSED');
    await waitForPreview(page, previous);
    await expect(page.locator('.text-box')).toHaveAccessibleName(/TOTALLY CURSED/);
    const changedText = await canvasSignature(page, 'result-canvas');
    expect(changedText).not.toBe(defaultText);

    // The yellow positioning box follows the text and is keyboard adjustable.
    await page.locator('.text-box').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.text-box')).toHaveAttribute('aria-label', /TOTALLY CURSED/);
  });

  test('compare, original and zoom controls behave', async ({ page }) => {
    await loadSample(page);

    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(page.locator('.compare-label--original')).toHaveText('Original');
    await expect(page.locator('.compare-label--result')).toHaveText('Destroyed');
    const split = page.getByRole('slider', { name: 'Comparison split position' });
    await split.fill('25');
    await expect(split).toHaveValue('25');
    await expect(page.locator('.split-control output')).toHaveText('25%');

    // Dragging anywhere on the compare frame moves the divider.
    const frame = await page.locator('.preview-frame').boundingBox();
    expect(frame).toBeTruthy();
    await page.mouse.move(
      frame!.x + frame!.width / 2,
      frame!.y + frame!.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      frame!.x + frame!.width * 0.75,
      frame!.y + frame!.height / 2,
      { steps: 4 },
    );
    await page.mouse.up();
    await expect(split).toHaveValue('75');
    await expect(page.locator('.split-control output')).toHaveText('75%');

    await page.locator('.view-tabs').getByRole('button', { name: 'Original' }).click();
    await expect(page.locator('.preview-layer--result')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(page.locator('.preview-controls__note')).toHaveText(
      'Source pixels, untouched.',
    );

    await page.locator('.view-tabs').getByRole('button', { name: 'Destroyed' }).click();
    await expect(page.locator('.preview-layer--result')).toHaveAttribute(
      'aria-hidden',
      'false',
    );

    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.locator('.zoom-readout__mode')).toHaveText('zoom');
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeEnabled();
    await page.locator('.zoom-readout').click();
    await expect(page.locator('.zoom-readout__mode')).not.toHaveText('zoom');
  });

  test('downloads PNG, JPG and WebP and copies a PNG', async (
    { page, context },
    testInfo,
  ) => {
    testInfo.setTimeout(120_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loadSample(page);
    await setQuality(page, 80);

    const expectations = [
      { id: 'png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
      { id: 'jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
      { id: 'webp', ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
    ] as const;

    for (const item of expectations) {
      await page.getByTestId(`format-${item.id}`).click();
      const downloadPromise = page.waitForEvent('download');
      await page.getByTestId('download-disaster').click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(`lowquality-sample-street.${item.ext}`);
      const destination = testInfo.outputPath(`disaster.${item.ext}`);
      await download.saveAs(destination);
      const bytes = readFileSync(destination);
      expect(Array.from(bytes.subarray(0, item.bytes.length))).toEqual([
        ...item.bytes,
      ]);
      await expect(
        page
          .locator('.toast--success')
          .filter({ hasText: `lowquality-sample-street.${item.ext}` })
          .last(),
      ).toBeVisible();
    }

    // GIF export is intentionally unavailable for still images.
    await expect(page.getByTestId('format-gif')).toBeDisabled();

    await page.bringToFront();
    await page.getByTestId('copy-png').click();
    await expect(
      page.getByRole('status').filter({ hasText: /on your clipboard/i }),
    ).toBeVisible({ timeout: 30_000 });
    const clipboardTypes = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap((item) => item.types);
    });
    expect(clipboardTypes).toContain('image/png');
  });

  test('clear returns to the polished empty state', async ({ page }) => {
    await loadSample(page);
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(
      page.getByRole('heading', { name: 'No disaster loaded' }),
    ).toBeVisible();
    await expect(page.locator('.preview-panel')).toHaveCount(0);
    await expect(page.locator('.editor-controls')).toBeHidden();
    await expect(
      page.getByRole('slider', { name: 'How bad should the image look' }),
    ).toBeHidden();
    await expect(page.getByTestId('download-disaster')).toHaveCount(0);
  });
});
