# AGENTS.md

Conventions for humans **and** AI agents working in this repository. This is the
canonical operational guide; `CLAUDE.md` just imports it (`@AGENTS.md`). Higher-level
platform principles live in the constitution (`.specify/memory/constitution.md`); this
file must stay consistent with it.

## What this project is

A collection of small, client-side **learning games for kids**, served as static files
from GitHub Pages. No server, no login, no accounts; progress lives in the browser;
installable/offline via PWA. Language/RTL/i18n policy is set by the constitution.

## Repository layout

- **`app/` is the published web root** (this is what deploys to GitHub Pages).
  Everything the browser loads lives here: `app/index.html` (portal),
  `app/games/<id>/`, `app/shared/{css,js}`, `app/shared/offline.html`,
  `app/assets/`, `app/manifest.json`, `app/service-worker.js`, `app/.nojekyll`.
- **Everything outside `app/` is meta/tooling and is NOT deployed**: `AGENTS.md`,
  `CLAUDE.md`, `.specify/` (constitution, Spec Kit), `.claude/` (skills), `specs/`,
  `README.md`, `LICENSE`, and dev config (`package.json`, `eslint.config.js`,
  linter dotfiles, `.github/`).

## Architecture (non-negotiable without a constitution amendment)

- **Static, client-side only.** The host is a dumb file server. Never introduce a
  server, database, or secret — anything shipped is public.
- **Multi-page, not an SPA.** Portal `app/index.html` plus one self-contained folder
  per game under `app/games/<id>/`.
- **Vanilla HTML/CSS/JS with ES modules.** No framework, no build step, no bundler.
  Dev-only linters and the dev server never ship to the browser.
- **PWA.** `app/manifest.json` + `app/service-worker.js`, which sits at the app root
  (the deployed site root is `app/`) so its scope covers the whole app.

## Coding conventions

### RTL & i18n (language policy is defined in the constitution)

- Every page: `<html lang="he" dir="rtl">` (default language per the constitution).
- **CSS logical properties only** (`margin-inline-start`, `padding-inline-end`,
  `inset-inline-start`, `text-align: start`) — never physical left/right.
- All user-facing text goes through `app/shared/js/i18n.js`; no hard-coded strings in
  markup. A game contributes its strings; it never restates the language policy.
- Hebrew copy is **gender-neutral (unisex)**, **simple/clear for kids**, **spells words
  out** (no abbreviations — «שניות», not «שנ׳»), and **pairs an icon with text** where it
  helps. If a phrase can't be made unisex, ask rather than defaulting to masculine.

### Storage

- Only `app/shared/js/storage.js` touches `localStorage`/`sessionStorage`.
- Durable data (progress, records, settings) → `localStorage`; ephemeral within-round
  state → in memory. Treat stored data as untrusted/editable.
- **A game's storage scope is its game id** — the same id as its `app/games/manifest.js`
  entry (the manifest is the id registry, so ids are unique and scopes never collide).
  Games get a scoped store from the shared **`scoped(gameId)`** helper in `storage.js`;
  keys namespace as `lg:<game-id>:<key>` (e.g. `lg:fast-calc:add-max20-q10`).

### Paths (subpath-safe)

- The site deploys under a subpath (e.g. `/learning-games/`). Use relative paths;
  service-worker scope, manifest, and asset links must work under that subpath —
  never root-absolute.

### Styling

- `app/shared/css/`: `reset.css`, `theme.css` (design tokens), `base.css` (layout,
  buttons, responsive, RTL). Games may override defaults in their own `game.css`.
- Touch-first: large hit targets (≥44px), responsive for phone and tablet.

## Identifiers — one id per game

Each game has a single stable **id** (kebab-case, ASCII) used identically for: the
folder `app/games/<id>/`, the manifest `id`, the **storage scope**, the tiny-spec
filename `specs/tiny/<id>.md`, and the branch `feature/<id>`. The display title (e.g.
Hebrew "חשבון מהיר") is a separate i18n string, never used as a key.

## Adding a game

1. Create `app/games/<id>/` with `index.html`, `game.js`, and optional `game.css`.
2. `index.html` imports the shared CSS + JS modules via relative paths.
3. Read/write progress/records **only** through `app/shared/js/storage.js` (scope = id).
4. Add one metadata entry to `app/games/manifest.js` (genre, min/max age, title, icon,
   locked?). Adding a game should not require editing portal code — only its metadata.
5. Write the tiny spec first (`specs/tiny/<id>.md`) and keep docs updated in the same
   commit.

## Portal

`app/index.html` renders game cards from `app/games/manifest.js` with genre + age
filters (filter headings **"סוג משחק"** / **"גילאים"**; game-list heading **"משחקים"**).
The **age filter matches on overlap** — a game shows when its `[minAge, maxAge]` overlaps
the selected band (e.g. a 5–9 game appears under a 9–12 filter), not only when fully
contained. Adding a game requires no portal code changes — only a manifest entry.

## Development process (the loop)

Standard loop for a change or feature, with explicit human checkpoints:

1. **Plan — Opus.** Author the spec/tiny-spec (Spec Kit / TinySpec) and the approach.
2. **Read — human.** You review and approve the spec before any code is written.
3. **Implement — Sonnet.** A Sonnet sub-agent builds strictly to the approved spec.
4. **Review — Opus.** An Opus sub-agent reviews the diff for correctness and convention
   adherence (RTL/logical CSS, storage gateway, subpath-safe paths, no build step).
5. **Test — human.** Run `npm run dev` and try it on desktop **and real mobile devices**
   on your LAN.
6. **Push & PR — Sonnet.** After your test approval, a Sonnet sub-agent pushes the
   `feature/<id>` branch and opens the PR. Outward actions happen only with your go-ahead.
7. **CI — GitHub.** Actions runs lint/format/HTML/link checks + a preview artifact and
   gates the merge to `main`.

The Opus review (step 4) complements, but does not replace, the automated CI gate.

## Spec-driven development

- **Small change / single game**: TinySpec (`specs/tiny/`) — `/speckit-tinyspec-classify`
  → `/speckit-tinyspec-tinyspec` → `/speckit-tinyspec-implement`.
- **Larger/cross-cutting work**: full SDD — `/speckit-specify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`.

## Git workflow (Gitflow)

- **`main` is protected and is the only branch that deploys**, via the **GitHub Actions
  Pages deploy** of `app/` (repo setting: Settings → Pages → Source = "GitHub Actions").
  Never push app work directly to `main`.
- **Feature branches** `feature/<id>` → **Pull Request** → **CI must pass** → merge to
  `main` → auto-deploy.
- Commits are small, focused, well-messaged (public repo — messages are documentation).
- **Update `README.md` / `AGENTS.md` / specs in the same commit** as the change they
  describe.

## Run locally

- `npm run dev` → serves `app/` at http://localhost:8000 and prints a **LAN URL** for
  phone/tablet testing on the same Wi-Fi.
- Or: `python -m http.server 8000 --directory app`.
- Or the **VS Code "Live Server"** extension (auto-reloads on save) — but it serves the
  repo root, so open `http://localhost:5500/app/` (note the `/app/` prefix; default port 5500).
- **PWA caveat**: service workers only register over HTTPS or `localhost`. On a phone via
  `http://<LAN-IP>:8000` the game works, but offline/install won't — use a tunnel
  (cloudflared/ngrok) or USB port-forwarding for on-device PWA testing.

## Quick reference — don't

- Add a framework/build step, use physical CSS directions, touch `localStorage` outside
  `storage.js`, hardcode root-absolute paths, put app files outside `app/`, or commit
  secrets / `.claude/settings.local.json`.
