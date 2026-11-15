import { test, expect } from '@playwright/test';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { geoDistance, geoMercator } from 'd3';

async function atlasSnapshot(page) {
  return page.locator('.atlas-shell').evaluate(shell => ({
    geography: shell.querySelector('.map-geography').outerHTML,
    results: shell.querySelector('#map-results').textContent,
    filters: [...shell.querySelectorAll('input, select')].map(input => ({
      id: input.id, value: input.value, checked: input.checked,
    })),
  }));
}

test('atlas composes search, geography and layers, including empty selections', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#map-results')).toHaveText('10 documented stories / Sudan');
  await expect(page.locator('.state-shape')).toHaveCount(19);
  await expect(page.locator('.state-bubble')).toHaveCount(5);
  await expect(page.locator('#state-select option:not([disabled])')).toHaveText([
    'All Sudan', 'Gedaref', 'Kassala', 'Northern', 'River Nile', 'White Nile',
  ]);
  await page.locator('#state-select').selectOption('Gedaref');
  await expect(page.locator('#map-results')).toHaveText('3 documented stories / Gedaref');
  await expect(page.locator('.project-pin')).toHaveCount(3);
  await page.getByRole('searchbox', { name: 'Search places and stories' }).fill('fuel');
  await expect(page.locator('#map-results')).toHaveText('1 documented story / Gedaref');
  await page.locator('#place-panel [data-project="helat"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('village location unverified');
  await page.keyboard.press('Escape');
  await page.getByRole('searchbox').fill('no-such-location');
  await expect(page.locator('#map-results')).toHaveText('0 documented stories / Gedaref');
  await expect(page.locator('#place-panel')).toContainText('No stories match');
  await page.locator('#reset-filters').click();
  await page.locator('#toggle-layers').click();
  await expect(page.locator('#map-results')).toHaveText('0 documented stories / Sudan');
  await expect(page.locator('.state-bubble')).toHaveCount(0);
  await page.locator('#toggle-layers').click();
  await page.locator('#show-localities').check();
  await expect(page.locator('.locality-boundaries path')).toHaveCount(189);
  await page.locator('#reset-filters').click();
  await expect(page.locator('.locality-boundaries path')).toHaveCount(0);
  await page.locator('.state-shape[data-state="Khartoum"]').click();
  await expect(page.locator('#place-panel')).toContainText('does not imply the absence');
  await expect(page.locator('#state-select')).toHaveValue('');
  await page.locator('#state-select').selectOption('Kassala');
  await expect(page.locator('#map-results')).toHaveText('2 documented stories / Kassala');
  await expect(page.locator('#state-select option:not([disabled])')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('right-hand map stories fade and drop smoothly with the latest selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const sample = await page.locator('#state-select').evaluate(select => {
    select.value = 'Gedaref';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const panel = document.querySelector('#place-panel');
    const animation = panel.getAnimations()[0];
    animation.pause();
    animation.currentTime = 125;
    return {
      duration: animation.effect.getTiming().duration,
      opacity: Number(getComputedStyle(panel).opacity),
      y: new DOMMatrix(getComputedStyle(panel).transform).f,
    };
  });
  expect(sample.duration).toBe(250);
  expect(sample.opacity).toBeCloseTo(.875, 3);
  expect(sample.y).toBeCloseTo(-.75, 3);
  await expect(page.locator('#map-results')).toHaveText('3 documented stories / Gedaref');
  await page.locator('#place-panel').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await page.locator('#state-select').evaluate(select => {
    select.value = 'Kassala';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('#place-panel').getAnimations()[0].pause();
  });
  await expect(page.locator('#place-panel .eyebrow')).toContainText('KASSALA');
  expect(await page.locator('#place-panel').evaluate(panel => ({
    animations: panel.getAnimations().length, scroll: panel.scrollTop,
  }))).toEqual({ animations: 1, scroll: 0 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#place-panel')).toHaveCSS('opacity', '1');
  await expect(page.locator('#place-panel')).toHaveCSS('transform', 'none');
  expect(await page.locator('#place-panel').evaluate(panel => panel.getAnimations().length)).toBe(0);
  await page.locator('#state-select').selectOption('Northern');
  expect(await page.locator('#place-panel').evaluate(panel => panel.getAnimations().length)).toBe(0);
  const photo = await page.locator('#place-panel img').elementHandle();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#map-theme').selectOption('women');
  expect(await photo.evaluate(image => image.isConnected)).toBe(true);
  expect(await page.locator('#place-panel').evaluate(panel => panel.getAnimations().length)).toBe(0);
  await page.locator('#place-panel [data-project="marawi"]').click();
  await expect(page.getByRole('dialog')).toContainText('Commercial smallholders scaling up');
});

test('the open atlas layout blends into the page across desktop, tablet and mobile', async ({ page }) => {
  await page.goto('/');
  for (const width of [1440, 860, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('.atlas-toolbar').scrollIntoViewIfNeeded();
    await expect(page.locator('.atlas-shell')).toHaveCSS('border-top-width', '0px');
    await expect(page.locator('.atlas-shell')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('#download-map')).toBeInViewport();
    await expect(page.locator('#download-data')).toBeInViewport();
    const map = await page.locator('.map-main').boundingBox();
    const panel = await page.locator('#place-panel').boundingBox();
    if (width > 960) expect(panel.x - map.x - map.width).toBeGreaterThanOrEqual(23);
    else expect(panel.y - map.y - map.height).toBeGreaterThanOrEqual(23);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('OCHA layer icons load and clicking an icon toggles its existing filter', async ({ page }) => {
  await page.goto('/');
  const icons = page.locator('.layer-option .layer-icon');
  await expect(icons).toHaveCount(9);
  await expect.poll(() => icons.evaluateAll(images => images.every(image =>
    image.complete && image.naturalWidth > 0 && image.getAttribute('src').startsWith('icons/ocha/')))).toBe(true);
  await page.locator('#toggle-layers').click();
  const solar = page.locator('.layer-option').filter({ hasText: 'Solar irrigation' });
  await solar.locator('.layer-icon').click();
  await expect(page.getByRole('checkbox', { name: 'Solar irrigation', exact: true })).toBeChecked();
  await expect(page.locator('#map-results')).toHaveText('4 documented stories / Sudan');
  await solar.locator('.layer-icon').click();
  await expect(page.getByRole('checkbox', { name: 'Solar irrigation', exact: true })).not.toBeChecked();
  await expect(page.locator('#map-results')).toHaveText('0 documented stories / Sudan');
});

test('all ten field stories replace the journey and preserve atlas and list position', async ({ page }) => {
  await page.goto('/');
  await page.locator('#state-select').selectOption('Gedaref');
  await page.getByRole('searchbox', { name: 'Search places and stories' }).fill('fuel');
  await page.locator('#toggle-layers').click();
  await page.getByRole('checkbox', { name: 'Solar irrigation', exact: true }).check();
  await page.locator('#map-theme').selectOption('women');
  await page.locator('#show-localities').check();
  await expect(page.locator('.locality-boundaries path').first()).toBeAttached();
  await expect(page.locator('.map-geography')).toHaveAttribute('transform', /scale\(3\.2\)/);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.map-geography')).toHaveAttribute('transform', /scale\(4\.8/);
  const before = await atlasSnapshot(page);
  await expect(page.getByRole('heading', { name: 'Field impact stories', exact: true })).toHaveCount(1);
  const links = page.locator('.story-card');
  await expect(links).toHaveCount(10);
  expect(new Set(await links.evaluateAll(nodes => nodes.map(node => node.hash))).size).toBe(10);
  await expect(page.locator('#journey, .story-grid')).toHaveCount(0);
  const card = page.locator('[data-story="white-nile"]');
  await card.scrollIntoViewIfNeeded();
  const listY = await page.evaluate(() => scrollY);
  await card.click();
  await expect(page).toHaveURL(/#\/stories\/white-nile$/);
  await expect(page.locator('#main')).toBeHidden();
  await expect(page.locator('#story-detail')).toContainText('835');
  await expect(page.locator('#story-detail')).toContainText(/projected/i);
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await page.locator('[data-story-back]').click();
  await expect(card).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(listY, 0);
  expect(await atlasSnapshot(page)).toEqual(before);
});

test('OCHA map markers follow enabled interventions and keep their size and story actions', async ({ page }) => {
  await page.goto('/');
  const nationalIcons = page.locator('.state-bubble image');
  await expect(nationalIcons).toHaveCount(8);
  expect((await nationalIcons.first().boundingBox()).width).toBeCloseTo(14, 0);
  const sources = await nationalIcons.evaluateAll(images => [...new Set(images.map(image => image.getAttribute('href')))]);
  for (const source of sources) {
    const response = await page.request.get(source);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('<svg');
  }
  await expect(page.locator('.state-bubble[aria-label^="Gedaref:"] .bubble-count')).toHaveText('3');
  await page.locator('#state-select').selectOption('Gedaref');
  const pins = page.locator('.project-pin');
  await expect(pins).toHaveCount(3);
  await expect(pins.nth(0).locator('image')).toHaveAttribute('href', 'icons/ocha/Submersible-pump_40676.svg');
  await expect(pins.nth(2).locator('image')).toHaveAttribute('href', 'icons/ocha/Financing_40523.svg');
  const icon = pins.first().locator('image');
  const initial = await icon.boundingBox();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await icon.boundingBox()).width).toBeCloseTo(initial.width, 0);
  expect(initial.width).toBeCloseTo(16, 0);
  expect((await pins.first().locator('.marker-hit').boundingBox()).width).toBeCloseTo(36, 0);
  const before = await icon.boundingBox();
  const mapBox = await page.locator('#map-canvas').boundingBox();
  await page.mouse.move(mapBox.x + 70, mapBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + 110, mapBox.y + 125, { steps: 5 });
  await page.mouse.up();
  const after = await icon.boundingBox();
  expect(after.x - before.x).toBeCloseTo(40, 0);
  expect(after.width).toBeCloseTo(initial.width, 0);
  await page.getByRole('button', { name: 'Reset to national view', exact: true }).click();
  await page.locator('#state-select').selectOption('Gedaref');
  await page.locator('#toggle-layers').click();
  await expect(pins).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Women & inclusion', exact: true }).check();
  await expect(pins).toHaveCount(2);
  for (const pin of await pins.all()) {
    await expect(pin.locator('image')).toHaveAttribute('href', 'icons/ocha/Gender_40433.svg');
  }
  await pins.first().click();
  await expect(page.getByRole('dialog')).toContainText('Solar irrigation for 230 women farmers in Gedaref');
  await page.keyboard.press('Escape');
  await pins.last().focus();
  await pins.last().press('Enter');
  await expect(page.getByRole('dialog')).toContainText('Women livestock keepers who guarantee each other');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await pins.first().locator('image').boundingBox()).width).toBeCloseTo(16, 0);
  expect((await pins.first().locator('.marker-hit').boundingBox()).width).toBeCloseTo(36, 0);
});

test('compact field stories keep rolling motion without reserved scroll space or automatic advances', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T12:00:01Z'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const slider = page.locator('.story-slider');
  const stage = page.locator('.story-stage');
  const cards = page.locator('.story-card');
  const next = page.getByRole('button', { name: 'Next story', exact: false });
  await expect(slider).not.toHaveClass(/is-static/);
  await slider.evaluate(element => element.scrollIntoView({ behavior: 'instant', block: 'center' }));
  expect((await stage.boundingBox()).height).toBeLessThanOrEqual(650);
  expect(await slider.evaluate(element =>
    Math.abs(element.getBoundingClientRect().height -
      element.querySelector('.story-stage').getBoundingClientRect().height)
  )).toBeLessThan(1);
  expect((await page.locator('#evidence').boundingBox()).y -
    ((await stage.boundingBox()).y + (await stage.boundingBox()).height)).toBeLessThanOrEqual(80);
  const listY = await page.evaluate(() => scrollY);
  await next.evaluate(button => button.click());
  await page.clock.runFor(208);
  const offsets = await slider.evaluate(element => {
    const photo = element.querySelector('.story-photo');
    return {
      step: +element.style.getPropertyValue('--story-step'),
      number: new DOMMatrix(getComputedStyle(element.querySelector('.story-numbers')).transform).f,
      photo: new DOMMatrix(getComputedStyle(photo).transform).f / photo.getBoundingClientRect().height,
      fill: new DOMMatrix(getComputedStyle(element.querySelector('.story-progress > span')).transform).d,
    };
  });
  expect(offsets.step).toBeGreaterThan(.3);
  expect(offsets.step).toBeLessThan(.7);
  expect(offsets.number).toBeCloseTo(-52 * offsets.step, 2);
  expect(offsets.photo).toBeCloseTo(-offsets.step, 3);
  expect(offsets.fill).toBeCloseTo(offsets.step / 9, 3);
  await page.clock.runFor(4500);
  await expect(slider).toHaveCSS('--story-step', '1');
  expect(await page.evaluate(() => scrollY)).toBe(listY);
  const before = (await stage.boundingBox()).y;
  await page.evaluate(() => scrollBy({ top: 80, behavior: 'instant' }));
  expect((await stage.boundingBox()).y).toBeCloseTo(before - 80, 0);
  await expect(slider).toHaveCSS('--story-step', '1');
  for (let index = 2; index < 10; index++) {
    await next.evaluate(button => button.click());
    await page.clock.runFor(432);
    await expect(page.locator('.story-scene[aria-hidden="false"] .story-card')).toHaveAttribute('data-story',
      await cards.nth(index).getAttribute('data-story'));
    await expect(cards.nth(index)).toBeInViewport();
    expect(await page.locator('.story-scene').evaluateAll(scenes => scenes.filter(scene => !scene.inert).length)).toBe(1);
  }
  await expect(next).toBeDisabled();
  await expect(page.getByRole('progressbar', { name: 'Field stories progress' })).toHaveAttribute('aria-valuenow', '100');
  await page.getByRole('button', { name: 'Previous story', exact: false }).evaluate(button => button.click());
  await page.clock.runFor(432);
  await expect(slider).toHaveCSS('--story-step', '8');
});

test('compact stories support keyboard navigation, return focus and static reading alternatives', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const slider = page.locator('.story-slider');
  await expect(slider).not.toHaveClass(/is-static/);
  const next = page.getByRole('button', { name: 'Next story', exact: false });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.story-position')).toHaveText('Story 2 of 10');
  await expect(page.locator('[data-story="associations"]')).toBeInViewport();
  await page.getByRole('button', { name: 'Previous story', exact: false }).click();
  await expect(page.locator('.story-position')).toHaveText('Story 1 of 10');
  await expect(slider).toHaveCSS('--story-step', '0');
  await next.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Continue to results', exact: false })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#evidence-title')).toBeInViewport();
  for (let index = 0; index < 9; index++) await next.click();
  await expect(slider).toHaveCSS('--story-step', '9');
  const last = page.locator('.story-card').last();
  await expect(last).toBeInViewport();
  const listY = await page.evaluate(() => scrollY);
  const photo = await page.locator('.story-scene').last().locator('.story-photo').boundingBox();
  await page.mouse.click(photo.x + photo.width / 2, photo.y + photo.height / 2);
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await page.locator('[data-story-back]').click();
  await expect(last).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(listY, 0);
  await expect(page.locator('.story-position')).toHaveText('Story 10 of 10');
  await last.click();
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await page.setViewportSize({ width: 1440, height: 600 });
  await page.locator('[data-story-back]').click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect(slider).toHaveClass(/is-static/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(slider).toHaveClass(/is-static/);
  expect(await page.locator('.story-scene').evaluateAll(scenes => scenes.every(scene => !scene.inert))).toBe(true);
  await expect(page.locator('.story-summary:visible')).toHaveCount(10);
  await page.emulateMedia({ reducedMotion: 'no-preference', media: 'print' });
  await expect(page.locator('.story-stage')).toHaveCSS('position', 'relative');
  await expect(page.locator('.story-summary:visible')).toHaveCount(10);
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect(slider).toHaveClass(/is-static/);
});

test('story page wipe follows reference timing and switches URL only while covered', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T12:00:01Z'));
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.story-card').first().click();
  await page.clock.runFor(300);
  await expect(page).not.toHaveURL(/#\/stories/);
  await expect(page.locator('#story-detail')).toBeHidden();
  const x = await page.locator('.page-transition-panel').evaluate(panel => panel.getBoundingClientRect().x);
  expect(x / 1440).toBeGreaterThan(-.65);
  expect(x / 1440).toBeLessThan(-.4);
  await page.clock.runFor(228);
  await expect(page).toHaveURL(/#\/stories\/berber$/);
  await expect(page.locator('.page-transition-panel')).toHaveCSS('background-color', 'rgb(0, 110, 181)');
  expect((await page.locator('.page-transition-panel').boundingBox()).x).toBe(0);
  expect(await page.evaluate(() => document.elementFromPoint(10, 10)?.closest('#page-transition')?.id)).toBe('page-transition');
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await page.clock.runFor(64);
  expect((await page.locator('.page-transition-panel').boundingBox()).x).toBe(0);
  await page.clock.runFor(232);
  const exitX = (await page.locator('.page-transition-panel').boundingBox()).x / 1440;
  expect(exitX).toBeGreaterThan(.35);
  expect(exitX).toBeLessThan(.6);
  await page.clock.runFor(264);
  await expect(page.locator('#page-transition')).toBeHidden();
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await page.locator('[data-story-back]').click();
  await page.clock.runFor(1100);
  await expect(page).toHaveURL(/#stories$/);
  await expect(page.locator('.story-card').first()).toBeFocused();
  await page.locator('.story-card').first().click();
  await page.clock.runFor(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#page-transition')).toBeHidden();
  await expect(page.locator('#story-detail h1')).toBeFocused();
});

test('story links support reload, browser history, unknown routes and explicit map exploration', async ({ page }) => {
  await page.goto('/#/stories/white-nile');
  await expect(page.locator('#story-detail')).toContainText('835');
  await page.reload();
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#story-detail h1')).toBeFocused();
  await expect(page).toHaveURL(/#\/stories\/white-nile$/);
  await page.locator('[data-story-back]').click();
  await expect(page.locator('#field-stories-title')).toBeFocused();
  await expect(page.locator('#field-stories-title')).toBeInViewport();
  await page.locator('[data-story="berber"]').click();
  await expect(page.locator('#story-detail')).toContainText('Location precision');
  await page.goBack();
  await expect(page.locator('#story-detail')).toBeHidden();
  await expect(page.locator('[data-story="berber"]')).toBeFocused();
  await page.goForward();
  await expect(page.locator('#story-detail')).toBeVisible();
  await page.locator('.main-nav a[href="#evidence"]').click();
  await expect(page.locator('#evidence-title')).toBeFocused();
  await page.goto('/#/stories/not-a-story');
  await page.reload();
  await expect(page.locator('#story-detail [role="alert"]')).toContainText('Story not found');
  await page.locator('[data-story-back]').click();
  await expect(page.locator('#field-stories-title')).toBeInViewport();
  await page.goto('/#/stories/galabat');
  await page.locator('[data-story-map]').click();
  await expect(page).toHaveURL(/#atlas$/);
  await expect(page.locator('#atlas-title')).toBeFocused();
  await expect(page.locator('#state-select')).toHaveValue('Gedaref');
  await page.goto('/#/stories/berber');
  await page.locator('.site-header .brand').click();
  await expect(page.locator('#hero-title')).toBeFocused();
});

test('field stories remain readable on mobile and disclose failed photographs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/images/image28.webp', route => route.abort());
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const slider = page.locator('.story-slider');
  await expect(slider).not.toHaveClass(/is-static/);
  await slider.scrollIntoViewIfNeeded();
  for (let index = 0; index < 10; index++) {
    if (index) await page.getByRole('button', { name: 'Next story', exact: false }).click();
    await expect(slider).toHaveCSS('--story-step', String(index));
    const scene = page.locator('.story-scene').nth(index);
    await expect(scene).toHaveAttribute('aria-hidden', 'false');
    if (index === 0) await expect(scene.locator('.story-photo-error')).toBeVisible();
    const bounds = await scene.evaluate(node => ['.story-card', '.story-summary', '.story-image-wrap'].map(selector =>
      node.querySelector(selector).getBoundingClientRect().toJSON()));
    for (const box of bounds) {
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(844);
      expect(box.right).toBeLessThanOrEqual(390);
    }
    expect(await scene.locator('.story-summary').evaluate(node => node.scrollHeight <= node.clientHeight)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.addStyleTag({ content: '.story-summary { font-size: 24px !important; }' });
  await expect(slider).toHaveClass(/is-static/);
  await expect(page.locator('.story-summary:visible')).toHaveCount(10);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('[data-story="berber"]').click();
  await expect(page.locator('#story-detail .story-photo-error')).toBeVisible();
  await expect(page.locator('#story-detail')).toContainText('What was delivered');
});

test('map supports zoom, pan, thematic shading and keyboard state exploration', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#map-canvas .state-shape')).toHaveCount(19);
  await expect(page.locator('#map-canvas .river')).toHaveCount(0);
  await expect(page.locator('.regional-country')).toHaveCount(8);
  await expect(page.locator('.regional-country').first()).toHaveCSS('pointer-events', 'none');
  expect(await page.locator('.map-geography').evaluate(scene =>
    Boolean(scene.querySelector('.regional-countries').compareDocumentPosition(scene.querySelector('.state-shape')) &
      Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.locator('#show-localities').check();
  await expect(page.locator('.locality-boundaries path')).toHaveCount(189);
  const scene = page.locator('#map-canvas svg > g').first();
  const geographicPositions = () => page.evaluate(() => ({
    countryX: document.querySelector('.context-labels text').getScreenCTM().e,
    stateX: document.querySelector('.state-labels text').getScreenCTM().e,
    localityX: document.querySelector('.locality-boundaries path').getScreenCTM().e,
    regionalX: document.querySelector('.regional-country').getScreenCTM().e,
    labelHeight: document.querySelector('.state-labels text').getBoundingClientRect().height,
  }));
  const initialLabels = await geographicPositions();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(scene).toHaveAttribute('transform', /scale\(1\.5\)/);
  const beforePan = await geographicPositions();
  expect(beforePan.labelHeight).toBeCloseTo(initialLabels.labelHeight, 0);
  const before = await scene.getAttribute('transform');
  const box = await page.locator('#map-canvas').boundingBox();
  await page.mouse.move(box.x + 70, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 130, { steps: 5 });
  await page.mouse.up();
  await expect(scene).not.toHaveAttribute('transform', before);
  const afterPan = await geographicPositions();
  expect(afterPan.countryX - beforePan.countryX).toBeCloseTo(afterPan.stateX - beforePan.stateX, 0);
  expect(afterPan.localityX - beforePan.localityX).toBeCloseTo(afterPan.stateX - beforePan.stateX, 0);
  expect(afterPan.regionalX - beforePan.regionalX).toBeCloseTo(afterPan.stateX - beforePan.stateX, 0);
  expect(Math.abs(afterPan.countryX - beforePan.countryX)).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Reset to national view', exact: true }).click();
  await expect(scene).toHaveAttribute('transform', 'translate(0,0) scale(1)');
  const stateShape = page.locator('.state-shape[data-state="Gedaref"]');
  const originalFill = await stateShape.evaluate(el => el.style.fill);
  await page.locator('#map-theme').selectOption('women');
  expect(await stateShape.evaluate(el => el.style.fill)).not.toBe(originalFill);
  await expect(page.locator('#map-legend-text')).toContainText('stories with women counts');
  const northern = page.locator('.state-bubble[aria-label^="Northern:"]');
  await northern.focus();
  await northern.press('Enter');
  await expect(page.locator('#state-select')).toHaveValue('Northern');
  await expect(page.locator('#place-panel')).toContainText('Commercial smallholders scaling up');
});

test('geographic labels do not collide after zooming, panning or resizing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.state-shape')).toHaveCount(19);
  const labelLayout = () => page.locator('#map-canvas').evaluate(container => {
    const labels = [...container.querySelectorAll('.map-label')]
      .filter(node => getComputedStyle(node).visibility === 'visible')
      .map(node => ({ text: node.textContent, rect: node.getBoundingClientRect() }));
    const collisions = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].rect, b = labels[j].rect;
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          collisions.push([labels[i].text, labels[j].text]);
        }
      }
    }
    return { visible: labels.length, collisions };
  });
  let layout = await labelLayout();
  expect(layout.visible).toBeGreaterThan(5);
  expect(layout.collisions).toEqual([]);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.map-geography')).toHaveAttribute('transform', /scale\(1\.5\)/);
  expect((await labelLayout()).collisions).toEqual([]);
  const box = await page.locator('#map-canvas').boundingBox();
  await page.mouse.move(box.x + 70, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 130, { steps: 5 });
  await page.mouse.up();
  expect((await labelLayout()).collisions).toEqual([]);
  await page.locator('.state-shape[data-state="Aj Jazirah"]').click();
  await expect(page.locator('.state-shape.selected-state')).toHaveAttribute('data-state', 'Aj Jazirah');
  await expect(page.locator('.state-labels text', { hasText: 'AJ JAZIRAH' })).toHaveCSS('visibility', 'visible');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#reset-filters').click();
  await expect(page.locator('.map-geography')).toHaveAttribute('transform', 'translate(0,0) scale(1)');
  layout = await labelLayout();
  expect(layout.visible).toBeGreaterThan(3);
  expect(layout.collisions).toEqual([]);
});

test('results show supported loan breakdowns and explain reported, projected and proposed figures', async ({ page }) => {
  await page.goto('/');
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.locator('#loan-total')).toHaveText('122');
  await expect(page.locator('#loan-table tr')).toHaveCount(3);
  await page.locator('#loan-breakdown').selectOption('women');
  await expect(page.locator('#loan-total')).toHaveText('55');
  await expect(page.locator('#loan-table td strong')).toHaveText(['13', '35', '7']);
  await page.locator('#loan-state').selectOption('Gedaref');
  await expect(page.locator('#loan-total')).toHaveText('35');
  await expect(page.locator('#loan-selection')).toContainText('women borrowers / Gedaref');
  const barRatio = await page.locator('.loan-bar').evaluate(bar =>
    bar.firstElementChild.getBoundingClientRect().width / bar.getBoundingClientRect().width);
  expect(barRatio).toBeCloseTo(35 / 52, 2);
  await page.locator('#loan-breakdown').selectOption('livestock');
  await expect(page.locator('#loan-total')).toHaveText('29');
  await page.locator('#loan-breakdown').selectOption('crops');
  await expect(page.locator('#loan-total')).toHaveText('14');
  await page.locator('#loan-breakdown').selectOption('men');
  await expect(page.locator('#loan-total')).toHaveText('8');
  await page.locator('#loan-breakdown').selectOption('all');
  await expect(page.locator('#loan-total')).toHaveText('43');
  await page.locator('#loan-state').selectOption('all');
  await expect(page.locator('#loan-total')).toHaveText('122');
  await expect(page.locator('.result-explanation')).toContainText('does not mean all 122 loans were fully repaid');
  await page.getByText('How the Credit Guarantee Scheme works', { exact: true }).click();
  await expect(page.locator('.evidence-method li')).toHaveCount(3);
  await expect(page.locator('.evidence-method li').first()).toBeVisible();
  await page.getByRole('tab', { name: /Jobs & employment/ }).click();
  await expect(page.locator('#jobs-chart dd strong')).toHaveText(['178', '351']);
  const jobWidths = await page.locator('.employment-track i').evaluateAll(bars =>
    bars.map(bar => bar.getBoundingClientRect().width));
  expect(jobWidths[0] / jobWidths[1]).toBeCloseTo(178 / 351, 2);
  await expect(page.locator('#evidence-content')).toContainText('projection, not a measured employment outcome');
  await page.getByRole('tab', { name: /Markets/ }).click();
  await expect(page.locator('#market-chart li')).toHaveCount(5);
  await expect(page.locator('#market-chart li').last()).toContainText('proposed, not completed');
  await page.getByRole('tab', { name: /Partners/ }).click();
  await expect(page.locator('#partner-roles > div')).toHaveCount(10);
  await expect(page.locator('#partner-roles > div').filter({ hasText: 'Kuwait Fund' })).toContainText('White Nile');
  await page.getByRole('tab', { name: /Five pathways/ }).click();
  await expect(page.locator('#pathways-chart li')).toHaveCount(5);
  await expect(page.locator('#pathways-chart li').last()).toContainText('not a completed export outcome');
  await expect(page.locator('.future-figures')).toContainText('not achieved coverage');
  await page.getByRole('tab', { name: /Five pathways/ }).press('Home');
  await expect(page.getByRole('tab', { name: /Finance & investment/ })).toHaveAttribute('aria-selected', 'true');
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`results stay compact without hiding evidence: ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#evidence').scrollIntoViewIfNeeded();
    await expect(page.locator('#loan-total')).toHaveText('122');
    const panel = page.locator('#evidence-content');
    expect((await panel.boundingBox()).height).toBeLessThanOrEqual(viewport.width === 1440 ? 600 : 1100);
    const metrics = await page.locator('.result-summary > div').evaluateAll(nodes =>
      nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(new Set(metrics.map(box => box.top)).size).toBe(1);
    expect(Math.max(...metrics.map(box => box.height))).toBeLessThanOrEqual(120);
    const tabs = await page.getByRole('tab').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    expect(new Set(tabs).size).toBe(1);
    if (viewport.width === 1440) {
      const overview = await page.locator('.finance-overview').boundingBox();
      const explorer = await page.locator('.loan-explorer').boundingBox();
      expect(explorer.x).toBeGreaterThanOrEqual(overview.x + overview.width);
    }
    await expect(panel.locator('.source-note').last()).toContainText('Published aggregates');
    await page.locator('#tab-finance').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#tab-pathways')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-pathways')).toBeInViewport();
    await expect(page.locator('#pathways-chart li')).toHaveCount(5);
    await expect(page.locator('.future-figures')).toContainText('not achieved coverage');
    await page.locator('#tab-jobs').click();
    if (viewport.width === 1440) expect((await panel.boundingBox()).height).toBeLessThanOrEqual(400);
    await expect(panel).toContainText('projection, not a measured employment outcome');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}

test('results tabs follow the reference underline and panel motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.goto('/');
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.locator('#loan-total')).toHaveText('122');
  await page.clock.pauseAt(new Date('2026-11-15T12:01:00Z'));
  const start = await page.locator('.tab-underline').boundingBox();
  const target = await page.locator('#tab-jobs').boundingBox();
  const timing = await page.locator('#tab-jobs').evaluate(button => {
    button.click();
    const incoming = document.querySelector('#evidence-content').getAnimations()[0];
    const outgoing = document.querySelector('.tab-panel-outgoing').getAnimations()[0];
    incoming.pause(); incoming.currentTime = 0;
    outgoing.pause(); outgoing.currentTime = 0;
    return { incoming: incoming.effect.getTiming(), outgoing: outgoing.effect.getTiming() };
  });
  expect(timing.incoming).toMatchObject({ duration: 200, delay: 100, easing: 'linear' });
  expect(timing.outgoing).toMatchObject({ duration: 200, delay: 0, easing: 'linear' });
  await expect(page.locator('#tab-finance')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#evidence-content')).toHaveCSS('opacity', '0');
  await page.clock.runFor(96);
  await expect(page.locator('#tab-finance')).toHaveAttribute('aria-selected', 'true');
  const moving = await page.locator('.tab-underline').boundingBox();
  expect((moving.x - start.x) / (target.x - start.x)).toBeCloseTo(4 * (96 / 250) ** 3, 1);
  await page.clock.runFor(32);
  await expect(page.locator('#tab-jobs')).toHaveAttribute('aria-selected', 'true');
  const halfway = await page.locator('#evidence-content').evaluate(panel => {
    panel.getAnimations()[0].currentTime = 200;
    document.querySelector('.tab-panel-outgoing').getAnimations()[0].currentTime = 100;
    const style = getComputedStyle(panel);
    return { opacity: Number(style.opacity), y: new DOMMatrixReadOnly(style.transform).m42 };
  });
  expect(halfway).toEqual({ opacity: 0.5, y: 4 });
  await expect(page.locator('.tab-panel-outgoing')).toHaveCSS('opacity', '0.5');
  await expect(page.locator('.tab-panel-outgoing')).toHaveAttribute('inert', '');
  await expect(page.locator('.tab-panel-outgoing [id]')).toHaveCount(0);
  await page.locator('#evidence-content').evaluate(panel => panel.getAnimations()[0].finish());
  await page.clock.runFor(200);
  await expect(page.locator('.tab-panel-outgoing')).toHaveCount(0);
  const end = await page.locator('.tab-underline').boundingBox();
  expect(end.x).toBeCloseTo(target.x, 0);
  expect(end.width).toBeCloseTo(target.width, 0);
  expect(end.height).toBe(4);
});

test('rapid tab changes settle on the latest panel and reduced motion cancels animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.locator('#loan-total')).toHaveText('122');
  await page.evaluate(() => {
    for (const id of ['jobs', 'markets', 'partners']) document.querySelector(`#tab-${id}`).click();
  });
  await expect(page.locator('#tab-partners')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#partner-roles > div')).toHaveCount(10);
  await expect(page.locator('.tab-panel-outgoing')).toHaveCount(0);
  await expect(page.locator('#evidence-content')).not.toHaveAttribute('inert');
  await page.locator('#tab-pathways').evaluate(button => button.click());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('#tab-pathways')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#evidence-content')).not.toHaveAttribute('inert');
  await expect(page.locator('.tab-panel-outgoing')).toHaveCount(0);
  await page.locator('#tab-pathways').press('Home');
  await expect(page.locator('#loan-total')).toHaveText('122');
  expect(await page.locator('#evidence-content').evaluate(panel => panel.getAnimations().length)).toBe(0);
  const underline = await page.locator('.tab-underline').boundingBox();
  const selected = await page.locator('#tab-finance').boundingBox();
  expect(underline.x).toBeCloseTo(selected.x, 0);
});

test('exports retain provenance and dialogs support keyboard dismissal', async ({ page }) => {
  await page.goto('/');
  await page.locator('#field-stories-title').scrollIntoViewIfNeeded();
  await page.locator('#state-select').selectOption('White Nile');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download-data').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sudan-atlas-selection.json');
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.filters.state).toBe('White Nile');
  expect(exported.filters.stage).toBe('all');
  expect(exported.projects).toHaveLength(1);
  expect(exported.projects[0].coordinatePrecision).toContain('Approximate');
  expect(exported.projects[0].beneficiaryUnit).toContain('households');
  await page.locator('#sources-button').click();
  await expect(page.getByRole('dialog')).toContainText('255 instalments due');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#sources-button')).toBeFocused();
  const publication = await page.request.get('/publication.docx');
  expect(publication.status()).toBe(200);
  const archive = unzipSync(await publication.body(), { filter: file => file.name === 'word/document.xml' });
  expect(new TextDecoder().decode(archive['word/document.xml'])).toContain('<w:document');
});

for (const variant of ['national', 'filtered state', 'filtered coverage', 'empty mobile']) {
  test(`map PNG includes focused detail, a Sudan locator and standalone legends: ${variant}`, async ({ page }, testInfo) => {
    await page.addInitScript(() => {
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function(...args) {
        if (args[0] instanceof HTMLImageElement && args[0].src.startsWith('data:image/svg+xml')) {
          window.mapExportSource = args[0].src;
        }
        return drawImage.apply(this, args);
      };
    });
    if (variant === 'empty mobile') await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('.state-shape')).toHaveCount(19);
    await expect(page.locator('.map-main')).toHaveCSS('background-color', 'rgb(245, 245, 245)');
    await expect(page.locator('.atlas-toolbar #download-map')).toBeVisible();
    await expect(page.locator('.atlas-toolbar #download-data')).toBeVisible();
    const toolbar = await page.locator('.atlas-toolbar').boundingBox();
    const mapBox = await page.locator('#map-canvas').boundingBox();
    expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(mapBox.y);
    if (variant === 'filtered state') {
      await page.locator('#state-select').selectOption('Gedaref');
      await page.getByRole('searchbox').fill('fuel');
      await page.locator('#toggle-layers').click();
      await page.getByRole('checkbox', { name: 'Solar irrigation', exact: true }).check();
      await page.locator('#map-theme').selectOption('women');
      await page.locator('#show-localities').check();
      await expect(page.locator('.locality-boundaries path').first()).toBeAttached();
      await expect(page.locator('.map-geography')).toHaveAttribute('transform', /scale\(3\.2\)/);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await expect(page.locator('.map-geography')).toHaveAttribute('transform', /scale\(4\.8/);
    }
    if (variant === 'filtered coverage') {
      await page.locator('#toggle-layers').click();
      await page.getByRole('checkbox', { name: 'Solar irrigation', exact: true }).check();
    }
    if (variant === 'empty mobile') await page.locator('#toggle-layers').click();
    const before = await atlasSnapshot(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download map PNG', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(variant === 'filtered state' ? 'sudan-atlas-gedaref.png' : 'sudan-atlas-all-sudan.png');
    await download.saveAs(testInfo.outputPath('map-report.png'));
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const png = Buffer.concat(chunks);
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.width).toBe(1800);
    expect(metadata.height).toBeGreaterThan(1200);
    const footer = await sharp(png).extract({ left: 40, top: metadata.height - 120, width: 1720, height: 110 }).stats();
    expect(footer.channels[0].min).toBeLessThan(150);
    const expectedFocusNames = variant === 'filtered state' ? ['Gedaref'] : variant === 'filtered coverage' ?
      ['Gedaref', 'River Nile'] : ['Gedaref', 'Kassala', 'Northern', 'River Nile', 'White Nile'];
    const report = await page.evaluate(focusNames => {
      const svg = new DOMParser().parseFromString(atob(window.mapExportSource.split(',')[1]), 'image/svg+xml');
      const root = svg.documentElement;
      root.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
      document.body.append(root);
      const detail = root.querySelector('.report-detail-map');
      const locator = root.querySelector('.report-locator-map');
      const scale = root.querySelector('.report-scale-bar');
      const segments = [...scale.querySelectorAll('rect')];
      const scalePosition = scale.transform.baseVal.consolidate().matrix;
      const focused = [...detail.querySelectorAll('.report-state')]
        .filter(node => focusNames.includes(node.getAttribute('data-state'))).map(node => node.getBBox());
      const focusBounds = {
        left: Math.min(...focused.map(box => box.x)), top: Math.min(...focused.map(box => box.y)),
        right: Math.max(...focused.map(box => box.x + box.width)), bottom: Math.max(...focused.map(box => box.y + box.height)),
      };
      const inside = (node, panel) => {
        const bounds = node.getBBox();
        return bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= Number(panel.getAttribute('width')) &&
          bounds.y + bounds.height <= Number(panel.getAttribute('height'));
      };
      const result = {
        text: [...root.querySelectorAll('text')].map(node => node.textContent).join('\n'),
        detailStates: detail.querySelectorAll('.report-state').length,
        locatorStates: locator.querySelectorAll('.report-state').length,
        locatorWidth: Number(locator.getAttribute('width')), locatorHeight: Number(locator.getAttribute('height')),
        locatorY: Number(locator.getAttribute('y')),
        locatorBottom: Number(locator.getAttribute('y')) + Number(locator.getAttribute('height')),
        scale: {
          x: scalePosition.e, y: scalePosition.f,
          width: segments.reduce((sum, segment) => sum + Number(segment.getAttribute('width')), 0),
          fills: segments.map(segment => segment.getAttribute('fill')),
          ticks: [...scale.querySelectorAll('.scale-tick')].map(tick => Number(tick.textContent)),
        },
        detailX: Number(detail.getAttribute('x')), locatorX: Number(locator.getAttribute('x')),
        focusBounds,
        backgrounds: [detail, locator].map(panel => panel.querySelector('rect').getAttribute('fill')),
        locatorStyleCount: new Set([...locator.querySelectorAll('.report-state')].map(node =>
          ['fill', 'stroke', 'stroke-width'].map(attribute => node.getAttribute(attribute)).join('|'))).size,
        neutralLocatorLabels: [...locator.querySelectorAll('text[font-weight]')].every(node =>
          node.getAttribute('font-weight') === '400'),
        regionalCountries: [detail, locator].map(panel => panel.querySelectorAll('.report-regional-country').length),
        countriesUnderSudan: [detail, locator].every(panel =>
          Boolean(panel.querySelector('.report-regional-countries').compareDocumentPosition(panel.querySelector('.report-state')) &
            Node.DOCUMENT_POSITION_FOLLOWING)),
        focusOccupancy: Math.max((focusBounds.right - focusBounds.left) / 1100, (focusBounds.bottom - focusBounds.top) / 900),
        detailCropsCountry: [...detail.querySelectorAll('.report-state')].some(node => !inside(node, detail)),
        wholeCountryVisible: [...locator.querySelectorAll('.report-state')].every(node => inside(node, locator)),
        detailPins: detail.querySelectorAll('.report-pin').length,
        locatorPins: locator.querySelectorAll('.report-pin, image').length,
        detailLocalities: detail.querySelectorAll('.report-locality').length,
        legendIcons: [...root.children].filter(node => node.tagName === 'image').length,
        embeddedIcons: [...root.querySelectorAll('image')].every(node => node.getAttribute('href').startsWith('data:image/svg+xml')),
      };
      root.remove();
      return result;
    }, expectedFocusNames);
    expect(report.text).toContain('LEGEND / SELECTED INTERVENTION LAYERS');
    expect(report.text).toContain('Source: UNDP Sudan, Water for Lives and Livelihoods (2026)');
    expect(report.text).toContain('Locations are approximate reference points');
    expect(report.text).toContain('not total programme coverage');
    expect(report.detailStates).toBe(19);
    expect(report.locatorStates).toBe(19);
    expect(report.regionalCountries).toEqual([8, 8]);
    expect(report.countriesUnderSudan).toBe(true);
    expect(report.text).toContain('Regional basemap: Natural Earth');
    expect(report.detailX).toBeLessThan(report.locatorX);
    expect(report.wholeCountryVisible).toBe(true);
    expect(report.detailCropsCountry).toBe(true);
    expect(report.locatorPins).toBe(0);
    expect(report.backgrounds).toEqual(['#ffffff', '#ffffff']);
    expect(report.locatorStyleCount).toBe(1);
    expect(report.neutralLocatorLabels).toBe(true);
    expect(report.text).not.toContain('SUDAN / LOCATION CONTEXT');
    expect(report.text).toContain('Kilometers (scale at');
    expect(report.scale.fills).toEqual(['#000000', '#ffffff', '#000000', '#ffffff']);
    expect(report.scale.ticks[0]).toBe(0);
    expect(report.scale.ticks[4]).toBeGreaterThan(0);
    expect(report.scale.y).toBeGreaterThan(report.locatorBottom);
    expect(report.scale.width).toBeLessThanOrEqual(report.locatorWidth - 90);
    const geo = await (await page.request.get('/data/sudan-states.geojson')).json();
    const projection = geoMercator().fitExtent([[45, 60], [report.locatorWidth - 45, report.locatorHeight - 45]], geo);
    const centerX = report.locatorWidth / 2, centerY = report.locatorHeight / 2;
    const measuredKilometers = geoDistance(
      projection.invert([centerX - report.scale.width / 2, centerY]),
      projection.invert([centerX + report.scale.width / 2, centerY]),
    ) * 6371.0088;
    expect(Math.abs(measuredKilometers / report.scale.ticks[4] - 1)).toBeLessThan(0.005);
    for (const [index, color] of [[0, 0], [1, 255]]) {
      const pixel = await sharp(png).extract({
        left: Math.floor(report.scale.x + (index + 0.5) * report.scale.width / 4),
        top: report.scale.y + 5, width: 1, height: 1,
      }).removeAlpha().raw().toBuffer();
      expect([...pixel]).toEqual([color, color, color]);
    }
    const [seaX, seaY] = projection([38, 20]);
    const backgroundPixel = await sharp(png).extract({
      left: Math.floor(report.locatorX + seaX), top: Math.floor(report.locatorY + seaY), width: 1, height: 1,
    }).removeAlpha().raw().toBuffer();
    expect([...backgroundPixel]).toEqual([255, 255, 255]);
    expect(report.focusBounds.left).toBeGreaterThanOrEqual(44);
    expect(report.focusBounds.top).toBeGreaterThanOrEqual(59);
    expect(report.focusBounds.right).toBeLessThanOrEqual(1056);
    expect(report.focusBounds.bottom).toBeLessThanOrEqual(856);
    expect(report.focusOccupancy).toBeGreaterThan(0.8);
    expect(report.text).not.toContain('OCHA icons mark');
    expect(report.text).not.toContain('States shown in the detail map');
    expect(report.text).not.toContain('Illustrative locator only');
    expect(report.embeddedIcons).toBe(true);
    expect(report.legendIcons).toBe(variant === 'national' ? 9 : variant === 'empty mobile' ? 0 : 1);
    expect(report.detailPins).toBe(variant === 'national' ? 10 : variant === 'filtered state' ? 1 : variant === 'filtered coverage' ? 4 : 0);
    if (variant === 'filtered state') {
      expect(report.text).toContain('Gedaref | 1 documented story');
      expect(report.text).toContain('Search: fuel');
      expect(report.text).toContain('matching stories with published women counts');
      expect(report.text).toContain('Selected state (highlight overrides shading)');
      expect(report.text).toContain('Dashed lines: locality boundaries (March 2020)');
      expect(report.detailLocalities).toBeGreaterThan(0);
    } else {
      expect(report.text).toContain(`All Sudan | ${variant === 'national' ? 10 : variant === 'filtered coverage' ? 4 : 0} documented stories`);
      if (variant === 'empty mobile') expect(report.text).toContain('No intervention layers selected.');
    }
    expect(await atlasSnapshot(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Download map PNG', exact: true })).toBeEnabled();
  });
}

test('map PNG asset failures are visible and the export button recovers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.state-bubble')).toHaveCount(5);
  await page.route('**/icons/ocha/**', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.getByRole('button', { name: 'Download map PNG', exact: true }).click();
  await expect(page.locator('#toast')).toContainText('The map image could not be downloaded.');
  await expect(page.locator('#toast')).toContainText('HTTP 503');
  await expect(page.getByRole('button', { name: 'Download map PNG', exact: true })).toBeEnabled();
  await page.unroute('**/icons/ocha/**');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download map PNG', exact: true }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('sudan-atlas-all-sudan.png');
});

test('mobile layout keeps the map and story controls usable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#hero-title')).toBeVisible();
  await page.locator('#state-select').selectOption('Kassala');
  await expect(page.locator('#map-results')).toHaveText('2 documented stories / Kassala');
  await page.locator('#place-panel [data-project="kalahoot"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('50 women');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.locator('#loan-total')).toHaveText('122');
  for (const tab of await page.getByRole('tab').all()) {
    await tab.click();
    await expect(page.locator('#evidence-content h3')).toBeVisible();
    expect(await page.locator('#evidence-content').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const underline = await page.locator('.tab-underline').boundingBox();
    const selected = await tab.boundingBox();
    expect(underline.x).toBeCloseTo(selected.x, 0);
    expect(underline.y + underline.height).toBeCloseTo(selected.y + selected.height, 0);
  }
  const brokenImages = await page.locator('img').evaluateAll(images => images.filter(i => i.complete && !i.naturalWidth).map(i => i.src));
  expect(brokenImages).toEqual([]);
});

test('preloader follows the reference timing and reveals the atlas only once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T12:00:01Z'));
  await page.goto('/');
  await expect(page.locator('#hero-title')).toBeAttached();
  await expect(page.locator('#preloader')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  await expect(page.locator('.hero-photo')).not.toHaveAttribute('style', /transform/);
  const bar = await page.locator('.preloader-track').boundingBox();
  expect(bar.width).toBe(180);
  expect(bar.height).toBe(4);
  await expect(page.locator('.preloader-number')).toHaveCSS('font-size', '28px');
  await page.clock.runFor(250);
  await expect(page.locator('.preloader-number')).toHaveText('0%');
  await page.clock.runFor(928);
  const percentage = Number((await page.locator('.preloader-number').textContent()).replace('%', ''));
  const expectedPercentage = elapsed => Math.round(100 * (1 - (1 - (elapsed - 250) / 1850) ** 3));
  // RAF can sample up to one frame before the requested clock time.
  expect(percentage).toBeGreaterThanOrEqual(expectedPercentage(1178 - 1000 / 60));
  expect(percentage).toBeLessThanOrEqual(expectedPercentage(1178));
  const filled = await page.locator('.preloader-fill').boundingBox();
  expect(filled.width / bar.width).toBeCloseTo(percentage / 100, 2);
  await page.clock.runFor(950);
  await expect(page.locator('.preloader-number')).toHaveText('100%');
  await page.clock.runFor(448);
  const midpoint = await page.evaluate(() => ({
    curtainY: document.querySelector('#preloader').getBoundingClientRect().y / innerHeight,
    heroOpacity: Number(getComputedStyle(document.querySelector('.hero-copy')).opacity),
    heroY: new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hero-copy')).transform).m42,
  }));
  const curtain = -midpoint.curtainY;
  const revealElapsed = 550 * (curtain < 0.5 ? Math.cbrt(curtain / 4) : 1 - Math.cbrt((1 - curtain) / 4));
  expect(revealElapsed).toBeGreaterThanOrEqual(2576 - 2300 - 1000 / 60);
  expect(revealElapsed).toBeLessThanOrEqual(2576 - 2300);
  const reveal = 1 - (1 - (revealElapsed - 50) / 600) ** 3;
  expect(midpoint.heroOpacity).toBeCloseTo(reveal, 2);
  expect(midpoint.heroY).toBeCloseTo(14 * (1 - reveal), 2);
  await page.clock.runFor(400);
  await expect(page.locator('#preloader')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
  await expect(page.locator('.hero-copy')).toHaveCSS('opacity', '1');
  await page.clock.runFor(2000);
  await expect(page.locator('#preloader')).toHaveCount(0);
});

test('preloader waits below 100 percent for delayed map data', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/data/projects.json', async route => {
    const response = await route.fetch();
    await waiting;
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-15T12:01:00Z'));
  await expect(page.locator('.preloader-number')).toHaveText('99%');
  await expect(page.locator('#app')).toHaveAttribute('inert', '');
  release();
  await expect(page.locator('#hero-title')).toBeAttached();
  await expect(page.locator('.preloader-number')).toHaveText('100%');
  await page.clock.runFor(700);
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.locator('#state-select').selectOption('Gedaref');
  await expect(page.locator('#map-results')).toHaveText('3 documented stories / Gedaref');
});

test('an unavailable opening photograph is disclosed without blocking the atlas', async ({ page }) => {
  await page.route('**/images/image58*.webp', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.hero-photo-error')).toContainText('photograph could not be loaded');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
  await page.locator('#state-select').selectOption('Northern');
  await expect(page.locator('#map-results')).toHaveText('1 documented story / Northern');
});

test('initial data failure is visible and retry restores the atlas', async ({ page }) => {
  await page.route('**/data/projects.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'The atlas could not be opened.' })).toBeVisible();
  await expect(page.locator('#preloader')).toHaveCount(0);
  await expect(page.locator('#app')).not.toHaveAttribute('inert');
  await expect(page.locator('main')).toContainText('HTTP 503');
  await page.unroute('**/data/projects.json');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#map-results')).toHaveText('10 documented stories / Sudan');
});

test('scrolling preserves the original page colors without a scroll-down cue', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  const before = await atlasSnapshot(page);
  const mapBackground = await page.locator('.map-main').evaluate(node => getComputedStyle(node).backgroundColor);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.scroll-cue')).toHaveCount(0);
  for (const selector of ['.hero', '#stories', '#evidence', '.hero']) {
    await page.locator(selector).evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 247, 243)');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(35, 46, 61)');
    await expect(page.locator('#stories')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('body')).not.toHaveClass(/landing-motion/);
  }
  await expect(page.locator('.atlas-shell')).toHaveCSS('color', 'rgb(35, 46, 61)');
  await expect(page.locator('.map-main')).toHaveCSS('background-color', mapBackground);
  expect(await atlasSnapshot(page)).toEqual(before);
});

test('layered waves retain their reference timing and respect reduced motion', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T12:00:01Z'));
  await page.addInitScript(() => {
    document.addEventListener('atlas:ready', () => { window.motionOrigin = performance.now(); }, { once: true });
  });
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.getByRole('table', { name: /Number of farmer loans by state/ })).toBeAttached();
  await page.evaluate(() => {
    function track(now) {
      window.motionFrameTime = now;
      window.motionFrame = requestAnimationFrame(track);
    }
    window.motionFrame = requestAnimationFrame(track);
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.closing-section .shape-divider').evaluate(node => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.clock.runFor(64);
  await expect(page.locator('.closing-section .shape-divider')).toBeInViewport();
  const first = await page.locator('.closing-section .wave-front').getAttribute('d');
  await page.clock.runFor(400);
  await expect(page.locator('.closing-section .wave-front')).not.toHaveAttribute('d', first);
  const wave = await page.evaluate(() => ({
    now: window.motionFrameTime - window.motionOrigin,
    front: Number(document.querySelector('.closing-section .wave-front').getAttribute('d').match(/L0,([-\d.]+)/)[1]),
    back: Number(document.querySelector('.closing-section .wave-back').getAttribute('d').match(/L0,([-\d.]+)/)[1]),
  }));
  const angle = 2 * Math.PI * (wave.now / 1000 % 4.7) / 4.7;
  expect(wave.front).toBeCloseTo(110 + 9 * Math.sin(-angle) + 3.5 * Math.sin(2 * angle + 0.5), 2);
  expect(wave.back).toBeCloseTo(100 + 8 * Math.sin(angle + 1) + 4 * Math.sin(-2 * angle), 2);
  await expect(page.locator('.closing-section .wave-back')).toHaveAttribute('opacity', '.45');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const staticWave = await page.locator('.closing-section .wave-front').getAttribute('d');
  await page.clock.runFor(600);
  await expect(page.locator('.closing-section .wave-front')).toHaveAttribute('d', staticWave);
  await page.evaluate(() => cancelAnimationFrame(window.motionFrame));
});

test('the wave divider blends into the fixed mobile background and is hidden in print', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await expect(page.locator('#map-results')).toHaveText('10 documented stories / Sudan');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const before = await page.locator('.closing-section .wave-front').getAttribute('d');
  await page.locator('#stories').scrollIntoViewIfNeeded();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 247, 243)');
  await expect(page.locator('.closing-section .wave-front')).toHaveCSS('fill', 'rgb(247, 247, 243)');
  await expect(page.locator('.closing-section .wave-front')).toHaveAttribute('d', before);
  await expect(page.locator('.story-card').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#field-stories-title')).toHaveCSS('color', 'rgb(35, 46, 61)');
  await expect(page.locator('.closing-section .shape-divider')).toBeHidden();
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`opening waves preserve the photograph and pause independently: ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#preloader')).toHaveCount(0);
    const hero = page.locator('.hero');
    const divider = hero.locator('.shape-divider');
    const front = divider.locator('.wave-front');
    const closing = page.locator('.closing-section .wave-front');
    const initial = await front.getAttribute('d');
    await expect(closing).toHaveAttribute('d', initial);
    await expect(divider.locator('rect')).toHaveCount(0);
    const heroBounds = await hero.boundingBox();
    const waveBounds = await divider.boundingBox();
    expect(waveBounds.y + waveBounds.height).toBeCloseTo(heroBounds.y + heroBounds.height, 0);
    expect(waveBounds.width).toBeCloseTo(heroBounds.width, 0);
    const actions = await page.locator('.hero-actions').boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(waveBounds.y);
    expect(await page.locator('.hero-photo').evaluate(image =>
      image.complete && image.naturalWidth > 0 && image.currentSrc.includes('image58'))).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(front).not.toHaveAttribute('d', initial);
    await expect(closing).toHaveAttribute('d', initial);
    await page.locator('#stories').evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
    await page.waitForTimeout(80);
    const paused = await front.getAttribute('d');
    await page.waitForTimeout(200);
    await expect(front).toHaveAttribute('d', paused);
    await hero.evaluate(node => node.scrollIntoView({ behavior: 'instant' }));
    await expect(front).not.toHaveAttribute('d', paused);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80);
    const reducedWave = await front.getAttribute('d');
    await page.waitForTimeout(200);
    await expect(front).toHaveAttribute('d', reducedWave);
    await page.emulateMedia({ media: 'print' });
    await expect(divider).toBeHidden();
  });

  test(`full-width hero photo retains scroll parallax: ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('#preloader')).toHaveCount(0);
    await expect(page.locator('.impact-strip')).toHaveCount(0);
    const hero = await page.locator('.hero').boundingBox();
    expect(hero.height).toBeLessThanOrEqual(viewport.width === 390 ? 560 : 600);
    const actions = await page.locator('.hero-actions').boundingBox();
    expect(actions.y + actions.height).toBeLessThanOrEqual(hero.y + hero.height);
    const map = await atlasSnapshot(page);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.hero-photo')).toHaveAttribute('style', /translate3d/);
    await expect(page.locator('.hero-photo')).toHaveCSS('object-fit', 'cover');
    const selectors = ['.hero-photo', '#hero-title', '.hero-actions', '#atlas'];
    const positions = () => page.evaluate(items => items.map(selector =>
      document.querySelector(selector).getBoundingClientRect().top), selectors);
    async function expectPhotoCoverage() {
      const bounds = await page.evaluate(() => {
        const hero = document.querySelector('.hero').getBoundingClientRect();
        const photo = document.querySelector('.hero-photo');
        return {
          hero: hero.toJSON(), photo: photo.getBoundingClientRect().toJSON(),
          width: document.documentElement.clientWidth, ready: photo.complete && photo.naturalWidth > 0,
          source: photo.currentSrc,
        };
      });
      expect(bounds.ready).toBe(true);
      expect(bounds.source).toMatch(/\/image58(?:-|\.webp)/);
      expect(bounds.hero.left).toBe(0);
      expect(bounds.hero.width).toBe(bounds.width);
      expect(bounds.photo.left).toBeLessThanOrEqual(bounds.hero.left);
      expect(bounds.photo.right).toBeGreaterThanOrEqual(bounds.hero.right);
      expect(bounds.photo.top).toBeLessThanOrEqual(bounds.hero.top);
      expect(bounds.photo.bottom).toBeGreaterThanOrEqual(bounds.hero.bottom - 0.1);
    }
    await expectPhotoCoverage();
    const before = await positions();
    await page.evaluate(() => scrollTo({ top: 120, behavior: 'instant' }));
    await expect.poll(async () => before[0] - (await positions())[0]).toBeCloseTo(84, 1);
    const after = await positions();
    [84, 120, 120, 120].forEach((distance, index) =>
      expect(before[index] - after[index]).toBeCloseTo(distance, 1));
    await expectPhotoCoverage();
    await page.evaluate(() => scrollTo({
      top: document.querySelector('.hero').getBoundingClientRect().bottom + scrollY - 20,
      behavior: 'instant',
    }));
    await expectPhotoCoverage();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(async () => (await positions())[0]).toBeCloseTo(before[0], 1);
    (await positions()).forEach((position, index) => expect(position).toBeCloseTo(before[index], 1));
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(247, 247, 243)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(await atlasSnapshot(page)).toEqual(map);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => scrollTo({ top: 120, behavior: 'instant' }));
    const reduced = await positions();
    expect(before[0] - reduced[0]).toBeCloseTo(120, 1);
    await expect(page.locator('.hero-photo')).toHaveCSS('transform', 'none');
  });
}

test('hero parallax remeasures after resizing and becomes static in print', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo({ top: 120, behavior: 'instant' }));
  await expect(page.locator('.hero-photo')).toHaveAttribute('style', /translate3d/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const normal = await page.locator('.hero-photo').boundingBox();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await page.locator('.hero-photo').boundingBox()).y - normal.y)
    .toBeCloseTo(36, 1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hero-photo')).toHaveCSS('transform', 'none');
  await expect(page.locator('.hero-visual')).toBeHidden();
});
