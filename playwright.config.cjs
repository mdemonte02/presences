const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:8765',
    viewport: { width: 1440, height: 1000 },
    timezoneId: 'Europe/Brussels',
    launchOptions: process.env.PRESENCE_CHROMIUM_PATH ? { executablePath: process.env.PRESENCE_CHROMIUM_PATH } : {},
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'python3 -m http.server 8765 --bind 127.0.0.1 --directory presence-cours-app-v3',
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: !process.env.CI
  }
});
