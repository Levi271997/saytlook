# Digitalfeet QA

Internal web QA and design-compare tool. Paste a live URL, the backend renders
it with Playwright, and the frontend draws four inspectors on top of the
resulting full-page screenshot:

1. **Design overlay** - drop a Figma export over the live page (opacity, difference blend, scale, drag/nudge) and get a pixelmatch diff score.
2. **Error scanner** - typography consistency, broken images, missing/empty alt, duplicated text, duplicated sections, plus axe-core.
3. **Heading inspector** - a colour-coded `H1`-`H6` badge on every heading, an outline tree, and structure warnings.
4. **Spacing inspector** - box-model dimension lines on hover, or the gap between every consecutive block down the main column.

The full spec lives in `CONTEXT.md`. Rename it to `CLAUDE.md` if you want Claude
Code to load it automatically.

## Why there is no iframe

Client sites send `X-Frame-Options` / CSP `frame-ancestors`, and cross-origin
rules would block reading their DOM anyway. Instead the API renders the target
**server-side** with headless Chromium and returns one `PageSnapshot`: a
full-page PNG plus every element's box and computed styles in full-page
coordinates. The frontend paints that PNG as the base layer and positions every
overlay from the same coordinates, so alignment is exact and there is no
cross-origin problem. All four features run on that one pattern.

## Quick start

```bash
pnpm install                          # also builds packages/analyzer
pnpm --filter @digitalfeet/api playwright:install   # Chromium, if not already present
cp .env.example .env                  # optional; the defaults work as-is

pnpm dev                              # API on :8787, web on :5173
```

Open http://localhost:5173 and paste a URL.

`PLAYWRIGHT_BROWSERS_PATH` may already point at an installed Chromium in some
environments - check before running the install step.

### Individual commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | API and web together |
| `pnpm dev:api` / `pnpm dev:web` | one at a time |
| `pnpm test` | Vitest over `packages/analyzer` |
| `pnpm typecheck` | `tsc --noEmit` across the workspace |
| `pnpm build` | analyzer + API to `dist/`, web to `apps/web/dist/` |

## Layout

```
apps/api          Express + Playwright: render, extract, HEAD-check images, run axe
apps/web          React + Vite + Tailwind: Stage, overlays, panels
packages/analyzer Pure, DOM-free checks and the shared PageSnapshot types
fixtures          A deliberately broken page for verifying the acceptance criteria
```

`packages/analyzer` is the important one. Every analyzer is a pure
`(snapshot) => Finding[]` with no DOM, no fetch and no side effects, which is
what makes it unit-testable now and portable to a Chrome-extension build later.
It is also where the tests live - 64 of them.

## The coordinate rule

Every box in a snapshot is in **full-page pixel space**, measured from the
top-left of the full-page screenshot. `Stage` displays the screenshot at
`pageSize * scale` and hosts overlays in a layer that is sized in raw page
pixels and CSS-transformed by that same scale, so overlay components only ever
deal in snapshot coordinates. Labels and badges counter-scale by `1 / scale` so
they stay a constant size on screen.

The one exception is `FigmaOverlay`, which converts to display pixels itself: a
CSS transform on an ancestor would create a new stacking context and stop
`mix-blend-mode: difference` blending against the screenshot underneath. Its
offsets are still stored in page pixels, so an arrow-key nudge means 1 page
pixel at any zoom.

`pageSize` comes from the PNG's own IHDR header rather than the DOM's reported
`scrollHeight`. The screenshot is what gets scaled, so if the two ever disagree
the image is the one that must win.

## API

| Endpoint | Purpose |
| --- | --- |
| `POST /api/render` | `{ url, viewport }` -> `{ snapshot, findings }` |
| `POST /api/analyze` | Re-run the analyzers on a snapshot the client already has, with different thresholds - no second render |
| `POST /api/validate-html` | Optional free pass: W3C Nu HTML Checker |
| `POST /api/spellcheck` | Optional free pass: LanguageTool (rate-limited, hence opt-in) |
| `GET /api/health` | Health plus the viewport presets |
| `GET /screenshots/*` | The captured PNGs |

Third-party endpoints are configured in `.env`, never hardcoded. axe-core is the
primary integration and runs locally inside the Playwright page, so it needs no
key and no network.

## Verifying it works

`fixtures/qa-test-page.html` is a deliberately broken page covering every
acceptance criterion. Serve it and render it:

```bash
npx serve fixtures -l 4100
# then render http://localhost:4100/qa-test-page.html
```

It should produce a 404 image error, an axe `image-alt` error, four typography
warnings, duplicated text and section warnings, and a skipped-heading-level
warning - while correctly *ignoring* the same paragraph repeated in `<nav>` and
`<footer>`. See `fixtures/README.md` for the full table.

## Deliberate non-goals

No auth, no billing, no database, no crawler, no Figma API, no browser farm.
One Playwright instance, screenshots on disk, state in memory.
