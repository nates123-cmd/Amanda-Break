# Amanda app — QA test plan

Automated Playwright harness for the **Amanda** PWA ("for Amanda" gift app, repo
`Amanda-Break`). Single-file vanilla-JS app (`index.html`, one inline `<script>`,
no build). Tests drive the **real** app code via `page.evaluate` against the
live page realm — no logic is re-implemented in the tests.

## How globals are reached

The inline script is a plain (non-module) `<script>`, so:
- `function` declarations (`navTo`, `buildHomeGrid`, `nextCard`, `rateCard`,
  `bookmarkCard`, `deleteBookmark`, `startTimer`, `stopTimer`, `pickRandom`,
  `saveSettings`, `clearData`, the breathe fns) become `window.*`.
- top-level `const` (`ACTIVITIES`, `CATEGORIES`, `GRATITUDE_MANTRAS`, `get`,
  `set`, `BREATHE_PHASES`, `BREATHE_DURATIONS`, `loaders`, `ICONS`) live in the
  global lexical scope — NOT on `window`, but reachable by bare name inside
  `page.evaluate` (same JS realm). Tests use bare names for those.

## Risk ranking (highest first)

1. **Home grid rendering / `buildHomeGrid` + `CATEGORIES`/`ACTIVITIES` coupling.**
   The grid is data-driven. CLAUDE.md warns every activity's `category` must
   match a `CATEGORIES` entry, or that card silently vanishes from home. The
   odd-length "span-2 last card" rule is fiddly index math. Highest blast radius:
   a mismatched category orphans a whole feature with no error. → `grid.spec.js`

2. **Persistence helpers `get`/`set` + dismissed/liked/disliked bookkeeping.**
   All ratings, dismissals, bookmarks, and the 100-item dismissed cap (`slice(-100)`)
   flow through `get`/`set`. `get` must survive malformed JSON (returns default).
   `nextCard`/`rateCard`/`bookmarkCard`/`deleteBookmark` mutate localStorage and
   dedupe by id. Corruption or dupes here degrade the whole experience silently.
   → `persistence.spec.js`

3. **Timer / countdown (`startTimer`/`stopTimer`) and breathe state machine.**
   `startTimer` formats `m:ss` with zero-pad, clears prior intervals, fires the
   chime + "All done" at zero. Breathe cycles `BREATHE_PHASES`/`BREATHE_DURATIONS`
   via `breathePhase % 4`. Interval leaks or off-by-one in the countdown are the
   classic timer bugs. (We assert the pure formatting + state transitions, not
   wall-clock timing, by stepping `secs` deterministically where possible.)
   → `timer.spec.js`

4. **Bookmark round-trip + Saved screen + `replayCard`.**
   `bookmarkCard` snapshots `card.outerHTML`; Saved list renders date via
   `new Date(savedAt).toLocaleDateString()`; `replayCard` re-injects the saved
   HTML and navigates. Date helper must not throw on a present/legacy timestamp.
   → covered in `persistence.spec.js`

5. **Boot / smoke + navigation + no-key gating.**
   `DOMContentLoaded` builds the grid, routes to home, and (no apiKey) bounces to
   settings after 80ms. `navTo` toggles `.active` screen classes and runs loaders.
   `makeLoader` shows the "Add your Anthropic API key" error when no key.
   → `smoke.spec.js`

6. **`pickRandom`** picks a real slug from `ACTIVITIES` and navigates to it.
   → `grid.spec.js`

## NOT covered (and why)

- **Live Claude API (`callClaude`) and the per-card AI loaders' happy path.**
  Requires a real Anthropic key + network; non-deterministic content. We test the
  no-key error branch and the JSON-extraction contract conceptually, but do not
  hit `api.anthropic.com`. (Could be covered by stubbing `window.fetch` with a
  canned Anthropic response — left out to keep the suite offline + fast.)
- **Wikipedia/Commons image fetches** (`fetchWikiImage`, `fetchInteriorImage`)
  and **open-meteo** — all external network, non-deterministic, and purely
  decorative (the app shows nothing rather than a wrong image). Not asserted.
- **`playChime`** — Web Audio; no audible assertion possible headless. We only
  assert it does not throw.
- **`journalToNote` / `shareCard`** — fire `navigator.share`/clipboard and a
  `shortcuts://` URL (iOS Shortcuts); side-effecting OS handoff, not unit-testable
  here. Clipboard is also permission-gated headless.
- **Service worker registration / offline caching** — SW is registered on boot;
  we don't assert cache behaviour (would need a second load + offline mode).
- **Touch swipe-to-dismiss** (`addSwipeListener`) — depends on synthetic
  touchstart/touchend with real `clientX` deltas; the *effect* (pushing an id
  into `dismissed_*`) is exercised directly via `nextCard` instead.
- **Visual/layout** (mobile 430px cap, palette) — out of scope for logic QA.

## Real app bugs / quirks found (documented, NOT patched — app is ADDITIVE-only)

- **`startTimer` clears a not-yet-assigned interval at zero (benign quirk).**
  `index.html:826-827` — `tick()` is called synchronously *before*
  `timerInterval = setInterval(tick, 1000)`. For a zero-length timer the first
  `tick()` immediately takes the `secs <= 0` branch and runs
  `clearInterval(timerInterval)` while `timerInterval` is still `null`, so it
  clears nothing; a live 1s interval is then installed anyway (it just no-ops the
  display once `secs` goes negative). Harmless for the real UI (the timer buttons
  never pass 0), but a latent footgun. Pinned by
  `timer.spec.js` "countdown reaching zero …". Not patched.

- **No real correctness bugs in the high-risk surfaces.** The grid
  category-coupling guard CLAUDE.md warns about (`grid.spec.js` "every
  ACTIVITIES.category is a known CATEGORY") currently passes — no orphaned cards.
  Persistence (`get`/`set`, dedupe, the 100-item dismissed cap), bookmark
  round-trip, breathe 4-4-4-4 state machine, and countdown formatting all behave
  as intended.

## Test-environment notes (not app bugs)

- The app registers a service worker on boot and reloads the page on the SW
  `controllerchange` event (`index.html:1411-1417`). Under Playwright that reload
  landed mid-test and destroyed the JS execution context, making the suite flaky.
  Fixed at the harness level with `serviceWorkers: 'block'` in
  `playwright.config.js` — the app is untouched.
- `clearData()` uses native `confirm()`/`alert()`; tests auto-accept via
  `page.on('dialog')`.
