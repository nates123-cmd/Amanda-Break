// Persistence layer — get/set + rating/dismissal/bookmark bookkeeping, all
// exercised against the REAL functions in the page realm. localStorage is reset
// per test by reloading with a clean context (Playwright gives each test a fresh
// context by default, but we also clear explicitly to be safe).
import { test, expect } from '@playwright/test';
import { boot } from './helper.js';
import { KEY_BOOKMARKS, dismissedKey, likedKey, dislikedKey } from './constants.js';

test.beforeEach(async ({ page }) => {
  await boot(page);
  await page.evaluate(() => localStorage.clear());
});

test('get returns the default for a missing key', async ({ page }) => {
  const v = await page.evaluate(() => get('nope_missing', 'fallback'));
  expect(v).toBe('fallback');
});

test('get survives malformed JSON and returns the default (no throw)', async ({ page }) => {
  const v = await page.evaluate(() => {
    localStorage.setItem('busted', '{not json');
    return get('busted', ['def']);
  });
  expect(v).toEqual(['def']);
});

test('set then get round-trips a value', async ({ page }) => {
  const v = await page.evaluate(() => {
    set('k1', { a: 1, b: [2, 3] });
    return get('k1', null);
  });
  expect(v).toEqual({ a: 1, b: [2, 3] });
});

test('nextCard pushes the id onto dismissed_<slug>, deduped', async ({ page }) => {
  const arr = await page.evaluate(() => {
    // stub the loader so nextCard's reload is a no-op
    loaders.flower = () => {};
    nextCard('flower', 'Rose');
    nextCard('flower', 'Rose');   // dup — must not double
    nextCard('flower', 'Tulip');
    return get('dismissed_flower', []);
  });
  expect(arr).toEqual(['Rose', 'Tulip']);
});

test('rateCard liked records the id under liked_<slug> (and not dismissed)', async ({ page }) => {
  const out = await page.evaluate(() => {
    loaders.flower = () => {};
    const btn = { classList: { add() {} } };
    rateCard('flower', 'Iris', 'liked', btn);
    return { liked: get('liked_flower', []), dismissed: get('dismissed_flower', []) };
  });
  expect(out.liked).toEqual(['Iris']);
  expect(out.dismissed).toEqual([]); // liking does NOT dismiss
});

test('rateCard disliked records the id AND marks it dismissed', async ({ page }) => {
  const out = await page.evaluate(() => {
    loaders.flower = () => {};
    const btn = { classList: { add() {} } };
    rateCard('flower', 'Daisy', 'disliked', btn);
    return { disliked: get('disliked_flower', []), dismissed: get('dismissed_flower', []) };
  });
  expect(out.disliked).toEqual(['Daisy']);
  expect(out.dismissed).toEqual(['Daisy']); // disliking implies don't-show-again
});

test('makeLoader caps the stored dismissed list at 100 entries', async ({ page }) => {
  // Pre-seed 100 dismissed ids, then run a loader once (fetch stubbed to return
  // a fresh card). The real makeLoader does dismissed.slice(-100) before storing.
  const len = await page.evaluate(async () => {
    // Pre-fill 100 ids
    const seed = Array.from({ length: 100 }, (_, i) => `old-${i}`);
    set('dismissed_flower', seed);
    set('apiKey', 'sk-test'); // pass the no-key gate
    // Stub fetch to return a fresh, unique flower name each call
    window.fetch = async () =>
      new Response(JSON.stringify({ content: [{ text: '{"name":"BrandNewFlower"}' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    await loaders.flower();
    return get('dismissed_flower', []).length;
  });
  expect(len).toBe(100); // 100 old + 1 new, sliced back to last 100
});

test('bookmarkCard snapshots a card; deleteBookmark removes it', async ({ page }) => {
  const out = await page.evaluate(() => {
    // Build a fake card in the DOM that bookmarkCard can read.
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="content-card">
        <div class="card-title">Test Card</div>
        <a href="https://example.com/x">link</a>
        <button class="footer-btn">x</button>
      </div>`;
    document.body.appendChild(host);
    const btn = host.querySelector('.footer-btn');
    bookmarkCard('flower', 'Test Card', btn);
    const afterAdd = get('bookmarks', []);
    deleteBookmark(0);
    const afterDelete = get('bookmarks', []);
    host.remove();
    return {
      addedLen: afterAdd.length,
      title: afterAdd[0]?.title,
      slug: afterAdd[0]?.slug,
      url: afterAdd[0]?.url,
      hasSavedAt: typeof afterAdd[0]?.savedAt === 'number',
      deletedLen: afterDelete.length,
    };
  });
  expect(out.addedLen).toBe(1);
  expect(out.title).toBe('Test Card');
  expect(out.slug).toBe('flower');
  expect(out.url).toBe('https://example.com/x');
  expect(out.hasSavedAt).toBe(true);
  expect(out.deletedLen).toBe(0);
});

test('bookmarkCard is idempotent for the same id+slug', async ({ page }) => {
  const len = await page.evaluate(() => {
    const host = document.createElement('div');
    host.innerHTML = `<div class="content-card"><div class="card-title">Dup</div><button class="footer-btn">x</button></div>`;
    document.body.appendChild(host);
    const btn = host.querySelector('.footer-btn');
    bookmarkCard('flower', 'Dup', btn);
    bookmarkCard('flower', 'Dup', btn); // should NOT add a second copy
    host.remove();
    return get('bookmarks', []).length;
  });
  expect(len).toBe(1);
});

test('Saved screen renders a saved card with a non-throwing date', async ({ page }) => {
  const text = await page.evaluate(() => {
    set('bookmarks', [{
      id: 'X', slug: 'good-news', title: 'Saved Headline',
      cardHtml: '<div class="content-card">hi</div>',
      url: 'https://example.com', savedAt: Date.now(),
    }]);
    loaders.saved();
    return document.getElementById('saved-content').textContent;
  });
  expect(text).toContain('Saved Headline');
  expect(text).toContain('good news'); // slug rendered with dashes->spaces
});

test('Saved screen shows the empty state when there are no bookmarks', async ({ page }) => {
  const html = await page.evaluate(() => {
    set('bookmarks', []);
    loaders.saved();
    return document.getElementById('saved-content').innerHTML;
  });
  expect(html).toContain('No saved cards yet');
});

test('replayCard injects saved HTML and navigates to that slug', async ({ page }) => {
  const out = await page.evaluate(() => {
    set('bookmarks', [{
      id: 'X', slug: 'good-news', title: 'T',
      cardHtml: '<div class="content-card" id="replayed-marker">replayed</div>',
      savedAt: Date.now(),
    }]);
    replayCard(0);
    return {
      active: document.querySelector('.screen.active')?.id,
      injected: !!document.getElementById('replayed-marker'),
    };
  });
  expect(out.active).toBe('screen-good-news');
  expect(out.injected).toBe(true);
});

test('clearData wipes everything except the API key', async ({ page }) => {
  // Auto-accept the confirm() dialog.
  page.on('dialog', (d) => d.accept());
  const out = await page.evaluate(() => {
    set('dismissed_flower', ['a']);
    set('bookmarks', [{ id: '1' }]);
    localStorage.setItem('apiKey', 'sk-keep-me');
    clearData();
    return {
      apiKey: localStorage.getItem('apiKey'),
      dismissed: localStorage.getItem('dismissed_flower'),
      bookmarks: localStorage.getItem('bookmarks'),
    };
  });
  expect(out.apiKey).toBe('sk-keep-me');
  expect(out.dismissed).toBe(null);
  expect(out.bookmarks).toBe(null);
});
