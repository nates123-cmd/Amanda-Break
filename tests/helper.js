// Shared helpers for the Amanda PWA test suite.
import { KEY_API } from './constants.js';

// Load the app and wait until the inline <script> has run. `buildHomeGrid` is
// the canary — once it's a function, the whole script body has executed and the
// const globals (ACTIVITIES, CATEGORIES, get/set, ...) are in scope.
export async function boot(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.buildHomeGrid === 'function');
}

// Seed an API key into localStorage BEFORE the page script runs, so boot does
// NOT bounce to the settings screen (the no-key branch) and loaders take the
// "has key" path. Paired with stubFetch so the fake key never hits the wire.
export async function seedApiKey(page, key = 'sk-ant-test-fake') {
  await page.addInitScript((args) => {
    localStorage.setItem(args.k, args.v);
  }, { k: KEY_API, v: key });
}

// Replace window.fetch with a no-op returning empty JSON, before app script runs
// — neutralises all network (Anthropic, Wikipedia, open-meteo) so boot/render is
// deterministic and quiet. Returns a benign Anthropic-shaped body so callClaude's
// JSON parse path doesn't explode if exercised.
export async function stubFetchEmpty(page) {
  await page.addInitScript(() => {
    window.fetch = async () =>
      new Response(JSON.stringify({ content: [{ text: '{}' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  });
}
