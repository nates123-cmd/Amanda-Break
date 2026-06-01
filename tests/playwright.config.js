// Playwright config for the Amanda PWA ("for Amanda" gift app). Serves the
// single-file app from the parent dir on :8212 so fetch/origin/localStorage
// behave like production. No app build step.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8212',
    trace: 'retain-on-failure',
    // The app registers a service worker on boot and reloads the page on the SW
    // `controllerchange` event. That reload lands mid-test and destroys the
    // page's JS execution context ("Execution context was destroyed …"), making
    // the suite flaky. Block SWs at the browser-context level — a TEST-ENV
    // setting only; the app code is untouched.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Serve the app root (parent of tests/) so index.html is at "/".
    command: 'python3 -m http.server 8212 --directory ..',
    port: 8212,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
