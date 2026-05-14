# Amanda app ("for Amanda" / Break)

A single-file PWA gifted to Amanda — a "little break" surface that serves curated cards across three buckets: Informational, Activity, Reflection.

## Where it lives

- Repo: `nates123-cmd/Amanda-Break` (origin remote)
- Live: https://nates123-cmd.github.io/Amanda-Break/ (GitHub Pages, deploys from default branch)
- Local: `/Users/natestephenson/Documents/Claude-Code-projects/Amanda app/`

## Shape

Everything is in `index.html` — HTML + inline CSS + inline JS. Sibling files are just shells:

- `index.html` — the entire app
- `manifest.json` — PWA metadata (name "for Amanda", short_name "Amanda", cream theme `#FAF7F2`)
- `sw.js` — service worker
- `icon-*.png` — watercolor cherry blossom icons (1024 / 512 / 192 / 180)

There is no build step. Edit `index.html` and push — GitHub Pages serves it.

## Design constraints

- Mobile-only: body is `max-width: 430px`. Don't add desktop-multi-column layouts.
- Palette is fixed in `:root` CSS vars at the top of `index.html`:
  - `--bg` `#FAF7F2` (cream), `--bg2` `#F0EBE3`
  - `--accent` `#D4847A` (warm rose)
  - `--text` `#3D2B1F` (espresso), `--text-muted` `#9B7B6F`
- Tone is warm/personal, not productivity-app. This is a gift, not a tool.

## Data model

- `ACTIVITIES` array (around line 516) — every card lives here, tagged with a bucket (`informational` / `activity` / `reflection`).
- `MINDFUL_PROMPTS` — reflection prompt pool.
- `BREATHE_DURATIONS` — 4-4-4-4 box breathing.
- Cards shown in the current session are tracked as dismissed so reopening a tile doesn't repeat the same card.

## External calls

The app talks to a few APIs directly from the browser (preconnect hints at top of `<head>`):

- `api.anthropic.com` — Claude API for content lookups (e.g. interior spotlight Wikipedia article picking)
- `en.wikipedia.org` / `commons.wikimedia.org` / `upload.wikimedia.org` — image + article fetches
- `geocoding-api.open-meteo.com` / `api.open-meteo.com` — weather card
- `chatgpt.com` (dns-prefetch only) — outbound link target

## Working in here

- Test by opening `index.html` directly in a browser, or use a static server. There's no dev server.
- Service worker caches aggressively — bump the cache version in `sw.js` when shipping changes, or test in a private window.
- Keep all logic single-file. Don't introduce a bundler or split into modules.
