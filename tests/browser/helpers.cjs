async function clickTool(page, id) {
  if (!await page.locator(`#${id}`).isVisible()) await page.locator('#toolsMenu > summary').click();
  await page.locator(`#${id}`).click();
}
async function settingsTab(page, key) {
  await page.locator(`[data-settings-tab="${key}"]`).click();
}
module.exports = { clickTool, settingsTab };
