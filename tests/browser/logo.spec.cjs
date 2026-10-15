const { test, expect } = require('@playwright/test');

test('logo : survol du nom, clic, clavier et préférence de mouvement', async ({ page }) => {
  await page.goto('/');
  const logo = page.getByRole('button', { name: 'Animer le logo Watchling' });
  const frames = () => logo.evaluate(element => {
    const animation = element.getAnimations()[0];
    if (!animation) return [];
    animation.pause();
    animation.currentTime = 500;
    return animation.effect.getKeyframes();
  });
  await page.locator('h1').hover();
  expect((await frames()).some(frame => frame.transform?.includes('rotate(-18deg)'))).toBe(true);
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
