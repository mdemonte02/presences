async function clickTool(page, id) {
  if (!await page.locator(`#${id}`).isVisible()) await page.locator('#toolsMenu > summary').click();
  await page.locator(`#${id}`).click();
}
module.exports = { clickTool };
