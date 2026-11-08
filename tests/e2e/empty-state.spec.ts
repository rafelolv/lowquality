import { expect, test } from '@playwright/test';
import { fixture } from './helpers';

test.describe('empty state and file safety', () => {
  test('shows the bundled before/after demo and keeps the controls hidden', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(
      page.getByRole('heading', { name: 'No disaster loaded' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'The before / after' })).toBeVisible();

    const demoImages = page.locator('.sample-demo img');
    await expect(demoImages).toHaveCount(2);
    await expect
      .poll(async () =>
        demoImages.evaluateAll((images) =>
          images.every(
            (image) =>
              image instanceof HTMLImageElement &&
              image.complete &&
              image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);

    // The duplicate control column only appears once a source exists.
    await expect(page.locator('.editor-controls')).toBeHidden();
    await expect(
      page.getByRole('slider', { name: 'How bad should the image look' }),
    ).toBeHidden();
    await expect(page.getByTestId('download-disaster')).toHaveCount(0);
  });

  test('can open the picker from the keyboard', async ({ page }) => {
    await page.goto('/');
    const upload = page.locator('.empty-upload');
    await expect(upload).toBeVisible();
    const chooser = page.waitForEvent('filechooser');
    await upload.press('Enter');
    const fileChooser = await chooser;
    await fileChooser.setFiles(fixture('dance.gif'));
    await expect(page.getByTestId('result-canvas')).toBeVisible({
      timeout: 45_000,
    });
  });

  test('rejects HEIC with an explanation and keeps the current workspace', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles(fixture('unsupported.heic'));

    await expect(
      page.getByRole('alert').filter({ hasText: /HEIC\/HEIF is not supported/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'No disaster loaded' }),
    ).toBeVisible();
  });

  test('rejects non-image files without creating a session', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('file-input').setInputFiles({
      name: 'definitely-not-a-photo.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not an image'),
    });

    await expect(
      page.getByRole('alert').filter({ hasText: /does not look like an image/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'No disaster loaded' }),
    ).toBeVisible();
    await expect(page.locator('.preview-panel')).toHaveCount(0);
  });
});
