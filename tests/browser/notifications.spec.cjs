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

test('notification : fermeture même avec survol et focus, annulation avant expiration', async ({ page }) => {
  await encode(page);
  await page.locator('#notice').hover();
  await page.locator('#undoBtn').focus();
  await page.clock.runFor(5001);
  await expect(page.locator('#notice')).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('presenceCours.v1')).entries.length)).toBe(1);
  await encode(page);
  await page.clock.runFor(3000);
  await page.locator('#undoBtn').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('presenceCours.v1')).entries.length)).toBe(1);
  await expect(page.locator('#noticeText')).toHaveText('Modification annulée.');
  await page.clock.runFor(2500);
  await expect(page.locator('#notice')).toBeVisible();
  await page.clock.runFor(2501);
  await expect(page.locator('#notice')).toBeHidden();
});
