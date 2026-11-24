import { test, expect } from '@playwright/test';

for (const javaScriptEnabled of [true, false]) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`retirement wall blocks the dashboard: ${viewport.width}px, JavaScript ${javaScriptEnabled}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport, javaScriptEnabled });
      try {
        const page = await context.newPage();
        const dashboardRequests = [];
        page.on('request', request => {
          if (/\/(?:data\/|src\/main\.js|publication\.docx)/.test(new URL(request.url()).pathname)) {
            dashboardRequests.push(request.url());
          }
        });
        await page.goto('./#/stories/berber');
        const title = page.getByRole('heading', { name: 'End of life for GIS products', exact: true });
        await expect(title).toBeVisible();
        await expect(page.locator('.retirement-wall')).toHaveCSS('position', 'fixed');
        expect(await page.locator('.retirement-wall').boundingBox()).toEqual({
          x: 0, y: 0, width: viewport.width, height: viewport.height,
        });
        await expect(page.locator('a, button, input, select, iframe, canvas, #app')).toHaveCount(0);
        await page.mouse.click(viewport.width / 2, viewport.height / 2);
        await page.keyboard.press('Escape');
        await page.keyboard.press('Tab');
        await page.mouse.wheel(0, 1000);
        await expect(title).toBeInViewport();
        await page.goto('./#atlas');
        await expect(title).toBeVisible();
        await page.reload();
        await expect(title).toBeVisible();
        expect(dashboardRequests).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
}
