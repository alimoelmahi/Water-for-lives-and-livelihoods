import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`production build works below the GitHub repository path: ${viewport.width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize(viewport);
    const root = new URL(baseURL);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.protocol === root.protocol && url.origin === root.origin && !url.pathname.startsWith(root.pathname)) {
        errors.push(`Request escaped the repository path: ${url.pathname}`);
      }
    });
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await page.goto('./');
    await expect(page.locator('#preloader')).toHaveCount(0);
    await expect(page.locator('#map-results')).toHaveText('10 documented stories / Sudan');
    expect(await page.locator('.hero-photo').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.locator('#show-localities').check();
    await expect(page.locator('.locality-boundaries path')).toHaveCount(189);
    await page.locator('#state-select').selectOption('Gedaref');
    await expect(page.locator('.project-pin')).toHaveCount(3);
    const download = page.waitForEvent('download');
    await page.locator('#download-map').click();
    const imageDownload = await download;
    expect(imageDownload.suggestedFilename()).toBe('sudan-atlas-gedaref.png');
    expect(await imageDownload.failure()).toBeNull();
    await expect(page.locator('#download-map')).toBeEnabled();
    await page.goto('./#/stories/berber');
    await expect(page.locator('#story-detail')).toContainText('85');
    await page.reload();
    await expect(page.locator('#story-detail h1')).toBeFocused();
    await page.locator('[data-story-back]').click();
    await expect(page.locator('#field-stories-title')).toBeInViewport();
    await page.locator('#evidence').scrollIntoViewIfNeeded();
    await expect(page.locator('#loan-total')).toHaveText('122');
    await page.locator('#loan-breakdown').selectOption('women');
    await expect(page.locator('#loan-total')).toHaveText('55');
    const publicationURL = await page.locator('.report-link').evaluate(link => link.href);
    expect(new URL(publicationURL).pathname).toBe(`${root.pathname}publication.docx`);
    const publication = await page.request.get(publicationURL);
    expect(publication.ok()).toBe(true);
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}
