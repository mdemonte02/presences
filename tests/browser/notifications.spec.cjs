const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T12:00:00+02:00') });
  await page.goto('/');
});
const encode = page => page.locator('#coursesGrid .quick-present').first().click();

test('notification : fermeture automatique et nouveau délai après une nouvelle action', async ({ page }) => {
  await encode(page);
  await page.clock.runFor(4000);
  await expect(page.locator('#notice')).toBeVisible();
  await encode(page);
  await page.clock.runFor(1500);
  await expect(page.locator('#notice')).toBeVisible();
  await page.clock.runFor(3501);
  await expect(page.locator('#notice')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('presenceCours.v1')).entries.length)).toBe(2);
});

test('notification : pause au survol et au clavier, annulation disponible', async ({ page }) => {
  await encode(page);
  await page.clock.runFor(2000);
  await page.locator('#notice').hover();
  await page.clock.runFor(6000);
  await expect(page.locator('#notice')).toBeVisible();
  await page.locator('#undoBtn').focus();
  await page.locator('h1').hover();
  await page.clock.runFor(6000);
  await expect(page.locator('#notice')).toBeVisible();
  await page.locator('#undoBtn').press('Enter');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('presenceCours.v1')).entries.length)).toBe(0);
  await page.locator('#themeBtn').focus();
  await page.clock.runFor(5001);
  await expect(page.locator('#notice')).toBeHidden();
});
