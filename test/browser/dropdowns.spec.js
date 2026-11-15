import { test, expect } from '@playwright/test';

test('all map and finance dropdowns use the shared picker without changing filter behavior', async ({ page }) => {
  await page.goto('/');
  const state = page.locator('#state-select');
  await expect(state).toHaveClass('motion-select');
  await state.evaluate(select => select.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await state.click();
  await expect(state).toHaveCSS('border-top-width', '2px');
  await expect(state).toHaveCSS('border-radius', '8px');
  const field = await state.boundingBox();
  expect(field.height).toBe(38);
  const firstOption = await state.locator('option[value="all"]').boundingBox();
  expect(firstOption.y - field.y - field.height).toBeCloseTo(10, 0);
  await expect(state.locator('option[hidden]')).toBeHidden();
  await state.getByRole('option', { name: 'Gedaref', exact: true }).hover();
  await expect(state.getByRole('option', { name: 'Gedaref', exact: true })).toHaveCSS('background-color', 'rgb(234, 243, 250)');
  await state.getByRole('option', { name: 'Gedaref', exact: true }).click();
  await expect(page.locator('#map-results')).toHaveText('3 documented stories / Gedaref');
  await expect(state.locator('selectedcontent')).toHaveText('Gedaref');
  await page.locator('#reset-filters').click();
  await expect(state.locator('selectedcontent')).toHaveText('All Sudan');
  await page.locator('#map-theme').selectOption('women');
  await expect(page.locator('#map-theme selectedcontent')).toHaveText('Stories with women counts');
  await page.locator('#evidence').scrollIntoViewIfNeeded();
  await expect(page.locator('#loan-state')).toHaveClass('motion-select');
  await expect(page.locator('select.motion-select')).toHaveCount(4);
  await page.locator('#loan-state').click();
  expect(await page.locator('#loan-state').evaluate(select => parseFloat(getComputedStyle(select, '::picker(select)').height))).toBe(112);
  await page.locator('#loan-state').getByRole('option', { name: 'Kassala', exact: true }).click();
  await page.locator('#loan-breakdown').selectOption('women');
  await expect(page.locator('#loan-selection')).toContainText('women borrowers / Kassala');
  await expect(page.locator('#loan-breakdown selectedcontent')).toHaveText('Women borrowers');
  await page.getByRole('tab', { name: /Jobs & employment/ }).click();
  await page.getByRole('tab', { name: /Finance & investment/ }).click();
  await expect(page.locator('#evidence-content select.motion-select')).toHaveCount(2);
});

test('dropdowns retain keyboard selection, cancellation and outside dismissal', async ({ page }) => {
  await page.goto('/');
  const state = page.locator('#state-select');
  await state.focus();
  await page.keyboard.press('Space');
  await expect(state).toHaveJSProperty('value', 'all');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(state).toHaveValue('White Nile');
  await expect(state).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  await page.keyboard.press('Escape');
  await expect(state).toHaveValue('White Nile');
  await state.click();
  await expect.poll(() => state.evaluate(select => select.matches(':open'))).toBe(true);
  await page.locator('#atlas-title').click();
  await expect.poll(() => state.evaluate(select => select.matches(':open'))).toBe(false);
  await expect(state).toHaveValue('White Nile');
});

test('dropdown opening and closing follow the reference motion and respect reduced motion', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const state = page.locator('#state-select');
  await state.click();
  const opening = await state.evaluate(select => {
    const picker = getComputedStyle(select, '::picker(select)');
    return {
      duration: picker.transitionDuration, easing: picker.transitionTimingFunction, shadow: picker.boxShadow,
      opacity: Number(picker.opacity), drop: new DOMMatrix(picker.transform).f,
    };
  });
  expect(opening.duration.split(',').every(duration => parseFloat(duration) === .25)).toBe(true);
  expect(opening.easing).toContain('0.333333, 1, 0.666667, 1');
  expect(opening.shadow).toContain('18px');
  expect(opening.drop).toBeCloseTo(-6 * (1 - opening.opacity), 3);
  await expect.poll(() => state.evaluate(select => getComputedStyle(select, '::picker(select)').opacity)).toBe('1');
  await expect.poll(() => state.evaluate(select => new DOMMatrix(getComputedStyle(select, '::picker-icon').transform).a)).toBeCloseTo(-Math.SQRT1_2, 3);
  await page.keyboard.press('Escape');
  const closing = await state.evaluate(select => {
    const picker = getComputedStyle(select, '::picker(select)');
    return { duration: picker.transitionDuration, easing: picker.transitionTimingFunction };
  });
  expect(closing.duration.split(',').every(duration => parseFloat(duration) === .15)).toBe(true);
  expect(closing.easing).toContain('linear(');
  await expect.poll(() => state.evaluate(select => getComputedStyle(select, '::picker(select)').opacity)).toBe('0');
  expect(await state.evaluate(select => getComputedStyle(select, '::picker(select)').display)).toBe('none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await state.click();
  expect(await state.evaluate(select => getComputedStyle(select, '::picker(select)').opacity)).toBe('1');
  expect(await state.evaluate(select => getComputedStyle(select, '::picker(select)').transitionDuration)).toBe('0s');
});

test('selected labels fade separately without overlapping and rapid changes keep the latest value', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preloader')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const state = page.locator('#state-select');
  await state.evaluate(select => select.addEventListener('input', () => {
    select.querySelectorAll('selectedcontent, .dropdown-previous').forEach(label =>
      label.getAnimations().forEach(animation => animation.pause()));
  }, { once: true }));
  await state.selectOption('Gedaref');
  async function sample(time) {
    return state.evaluate((select, time) => {
      select.querySelectorAll('selectedcontent, .dropdown-previous').forEach(label =>
        label.getAnimations().forEach(animation => { animation.currentTime = time; }));
      const old = select.querySelector('.dropdown-previous');
      return {
        old: old ? Number(getComputedStyle(old).opacity) : 0,
        current: Number(getComputedStyle(select.querySelector('selectedcontent')).opacity),
      };
    }, time);
  }
  expect(await sample(50)).toEqual({ old: .5, current: 0 });
  expect(await sample(110)).toEqual({ old: 0, current: 0 });
  const incoming = await sample(170);
  expect(incoming.old).toBe(0);
  expect(incoming.current).toBeCloseTo(.5, 3);
  await state.selectOption('Kassala');
  await state.selectOption('Northern');
  await expect(state.locator('selectedcontent')).toHaveText('Northern');
  await expect(state.locator('.dropdown-previous')).toHaveCount(0);
  await expect(page.locator('#map-results')).toHaveText('1 documented story / Northern');
});

test('mobile dropdowns fit the viewport and appear above the clipped map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const theme = page.locator('#map-theme');
  await expect(theme).toHaveClass('motion-select');
  expect((await page.locator('.search-control').boundingBox()).width).toBeGreaterThanOrEqual(140);
  expect((await page.locator('#state-select').boundingBox()).width).toBeLessThanOrEqual(180);
  await theme.click();
  const option = theme.getByRole('option', { name: 'Stories with women counts', exact: true });
  await expect(option).toBeVisible();
  const box = await option.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await option.click();
  await expect(theme).toHaveValue('women');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
