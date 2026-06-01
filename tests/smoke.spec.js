// Boot smoke tests — guard that the inline script runs clean, the home grid
// builds, navigation toggles screens, and the no-key gate behaves.
import { test, expect } from '@playwright/test';
import { boot, seedApiKey, stubFetchEmpty } from './helper.js';

test('title is "for Amanda" and core globals are defined after boot', async ({ page }) => {
  await boot(page);
  await expect(page).toHaveTitle('for Amanda');
  // window-attached function declarations
  const fns = await page.evaluate(() =>
    ['navTo', 'buildHomeGrid', 'nextCard', 'rateCard', 'bookmarkCard',
     'deleteBookmark', 'startTimer', 'stopTimer', 'pickRandom', 'saveSettings',
     'clearData', 'toggleBreathe', 'replayCard']
      .every((f) => typeof window[f] === 'function'));
  expect(fns).toBe(true);
  // const globals reachable by bare name in the page realm
  const consts = await page.evaluate(() => ({
    activities: Array.isArray(ACTIVITIES),
    categories: Array.isArray(CATEGORIES),
    mantras: Array.isArray(GRATITUDE_MANTRAS),
    get: typeof get === 'function',
    set: typeof set === 'function',
    loaders: typeof loaders === 'object',
  }));
  expect(consts).toEqual({
    activities: true, categories: true, mantras: true,
    get: true, set: true, loaders: true,
  });
});

test('boot with no API key bounces to the settings screen', async ({ page }) => {
  // No seeded key: DOMContentLoaded schedules navTo('settings') after 80ms.
  await boot(page);
  await expect(page.locator('#screen-settings')).toHaveClass(/active/);
});

test('boot WITH an API key stays on home (no settings bounce)', async ({ page }) => {
  await seedApiKey(page);
  await stubFetchEmpty(page);
  await boot(page);
  await page.waitForTimeout(200); // let the 80ms bounce window pass
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
  await expect(page.locator('#screen-settings')).not.toHaveClass(/active/);
});

test('home grid renders an activity card for every ACTIVITIES entry', async ({ page }) => {
  await boot(page);
  const { domCount, dataCount } = await page.evaluate(() => ({
    domCount: document.querySelectorAll('#activity-sections .activity-card').length,
    dataCount: ACTIVITIES.length,
  }));
  expect(domCount).toBe(dataCount);
});

test('navTo toggles the active screen class', async ({ page }) => {
  // Seed a key so the no-key setTimeout(navTo('settings'),80) bounce never fires
  // and races our navTo calls below.
  await seedApiKey(page);
  await stubFetchEmpty(page);
  await boot(page);
  await page.waitForTimeout(120); // let the (suppressed) bounce window elapse
  await page.evaluate(() => navTo('breathe', true)); // skipLoad — breathe loader is a no-op anyway
  await expect(page.locator('#screen-breathe')).toHaveClass(/active/);
  await expect(page.locator('#screen-home')).not.toHaveClass(/active/);
  await page.evaluate(() => navTo('home', true));
  await expect(page.locator('#screen-home')).toHaveClass(/active/);
});

test('makeLoader shows the "add API key" error when no key is set', async ({ page }) => {
  await boot(page); // no key seeded
  await page.evaluate(async () => { await loaders.flower(); });
  const html = await page.locator('#flower-content').innerHTML();
  expect(html).toContain('Anthropic API key');
});

test('boot throws no uncaught page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seedApiKey(page);
  await stubFetchEmpty(page);
  await boot(page);
  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
});
