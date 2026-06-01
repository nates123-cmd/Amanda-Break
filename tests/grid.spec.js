// Home grid rendering — the highest-risk surface. The grid is data-driven from
// ACTIVITIES + CATEGORIES; a category mismatch silently orphans a card (CLAUDE.md
// warns about exactly this). All assertions call the REAL buildHomeGrid / data.
import { test, expect } from '@playwright/test';
import { boot } from './helper.js';
import { EXPECTED_CATEGORIES } from './constants.js';

test('CATEGORIES matches the documented order', async ({ page }) => {
  await boot(page);
  const cats = await page.evaluate(() => CATEGORIES);
  expect(cats).toEqual(EXPECTED_CATEGORIES);
});

test('every ACTIVITIES.category is a known CATEGORY (no orphaned cards)', async ({ page }) => {
  await boot(page);
  // Run the real coupling check against the real arrays.
  const orphans = await page.evaluate(() =>
    ACTIVITIES.filter((a) => !CATEGORIES.includes(a.category)).map((a) => a.slug));
  expect(orphans).toEqual([]);
});

test('buildHomeGrid renders one section per non-empty category, in order', async ({ page }) => {
  await boot(page);
  const headers = await page.$$eval('#activity-sections .section-header',
    (els) => els.map((e) => e.textContent.trim()));
  const expected = await page.evaluate(() =>
    CATEGORIES.filter((c) => ACTIVITIES.some((a) => a.category === c)));
  expect(headers).toEqual(expected);
});

test('each card carries the right slug and an onclick to navTo', async ({ page }) => {
  await boot(page);
  const cards = await page.$$eval('#activity-sections .activity-card', (els) =>
    els.map((e) => ({
      slug: e.getAttribute('data-activity'),
      onclick: e.getAttribute('onclick'),
    })));
  const slugs = await page.evaluate(() => ACTIVITIES.map((a) => a.slug));
  expect(cards.map((c) => c.slug)).toEqual(slugs);
  for (const c of cards) {
    expect(c.onclick).toBe(`navTo('${c.slug}')`);
  }
});

test('odd-length category groups give their last card the span-2 class', async ({ page }) => {
  await boot(page);
  // Compute expected span-2 slugs from the REAL data + the REAL rule
  // (last card spans 2 cols when the group length is odd).
  const expectedSpan2 = await page.evaluate(() => {
    const out = [];
    for (const cat of CATEGORIES) {
      const cards = ACTIVITIES.filter((a) => a.category === cat);
      if (cards.length % 2 === 1 && cards.length) out.push(cards[cards.length - 1].slug);
    }
    return out.sort();
  });
  const domSpan2 = await page.$$eval('#activity-sections .activity-card.span-2',
    (els) => els.map((e) => e.getAttribute('data-activity')).sort());
  expect(domSpan2).toEqual(expectedSpan2);
});

test('rebuilding the grid is idempotent (no duplicate cards)', async ({ page }) => {
  await boot(page);
  const before = await page.$$eval('#activity-sections .activity-card', (e) => e.length);
  await page.evaluate(() => buildHomeGrid());
  const after = await page.$$eval('#activity-sections .activity-card', (e) => e.length);
  expect(after).toBe(before);
});

test('pickRandom navigates to a real ACTIVITIES slug', async ({ page }) => {
  await boot(page);
  const result = await page.evaluate(() => {
    pickRandom();
    const active = document.querySelector('.screen.active');
    const slug = active ? active.id.replace(/^screen-/, '') : null;
    return { slug, isReal: ACTIVITIES.some((a) => a.slug === slug) };
  });
  expect(result.isReal).toBe(true);
});
