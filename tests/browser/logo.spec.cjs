const { test, expect } = require('@playwright/test');

test('logo : survol du nom, clic, clavier et préférence de mouvement', async ({ page }) => {
  await page.goto('/');
  const logo = page.getByRole('button', { name: 'Animer le logo Watchling' });
  const frames = () => page.locator(".logo-watcher").evaluate(element => {
    const animation = element.getAnimations()[0];
    if (!animation) return [];
    animation.pause();
    animation.currentTime = 500;
    return animation.effect.getKeyframes();
  });
  const personBefore = await page.locator('.logo-person').boundingBox();
  await page.locator('h1').hover();
  expect((await frames()).some(frame => frame.transform?.includes('1.34'))).toBe(true);
  expect(await page.locator('.logo-person').evaluate(e => e.getAnimations().length)).toBe(0);
  expect(await page.locator('.logo-person').boundingBox()).toEqual(personBefore);
  await logo.click();
  expect((await frames()).length).toBeGreaterThan(0);
  await logo.press('Enter');
  expect((await frames()).length).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await logo.click();
  const reducedFrames = await frames();
  expect(reducedFrames.some(frame => frame.transform)).toBe(false);
  expect(reducedFrames.some(frame => Number(frame.opacity) === .45)).toBe(true);
});
