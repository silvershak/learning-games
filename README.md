# Learning Games (משחקי למידה)

A collection of small, browser-based learning games for kids — in **Hebrew**, with
an English translation possibly coming later. Button-driven, minimal-text, and
tablet/phone friendly.

> **Live site:** https://silvershak.github.io/learning-games/ _(update if your
> GitHub username / repo name differ)_

## What it is

- **100% client-side.** No server, no login, no accounts. Nothing you do leaves
  your device.
- **Progress saved locally** in your browser (`localStorage`). Clearing browser
  data resets progress; progress does not sync across devices.
- **Installable (PWA).** Works offline once loaded; can be added to a tablet's
  home screen.
- **Free for non-commercial use.** Use it, study it, fork it, remix it — for personal, educational, and other non-commercial purposes. Commercial use is not permitted. See [License](#license).

## Tech stack

| Concern    | Choice                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| Runtime    | The browser — nothing else                                                       |
| Language   | Vanilla HTML + CSS + JavaScript (ES modules)                                     |
| Structure  | **Multi-page**: a portal (`app/index.html`) + one self-contained folder per game |
| Layout     | Right-to-left (Hebrew), responsive for phone/tablet                              |
| Offline    | PWA (`manifest.json` + service worker)                                           |
| Build step | **None.** Files are served as-is.                                                |
| Hosting    | GitHub Pages — GitHub Actions deploy of the `app/` folder                        |

There is intentionally **no framework and no build tooling** for the app itself.
The only dev dependencies (linters/formatters) exist for CI and never ship to the
browser. See [`AGENTS.md`](./AGENTS.md) before adding any.

## Project structure

```
learning-games/
├── app/                     # Published web root (deployed to GitHub Pages)
│   ├── index.html           # Portal / hub: browse games by genre, filter by age
│   ├── manifest.json        # PWA metadata
│   ├── service-worker.js    # Offline caching (app root = full scope)
│   ├── .nojekyll
│   ├── games/               # One self-contained folder per game
│   │   └── <game-id>/
│   │       ├── index.html
│   │       ├── game.js
│   │       └── game.css     # optional; may override shared defaults
│   ├── shared/              # Shared code so games don't repeat themselves
│   │   ├── offline.html     # PWA offline fallback page
│   │   ├── css/             # reset, theme (design tokens), base (RTL, responsive)
│   │   └── js/              # storage, audio, nav, i18n, utils (ES modules)
│   └── assets/              # icons (PWA), images, sounds
│
├── specs/tiny/              # One tiny spec per game (see AGENTS.md)
├── .specify/                # Spec Kit templates, scripts, constitution
├── .claude/                 # Claude Code skills (Spec Kit workflow) — committed on purpose
├── .github/workflows/       # CI (checks) + deploy (Pages)
├── AGENTS.md                # Conventions for humans and AI agents
├── CLAUDE.md                # Imports AGENTS.md for Claude Code
├── package.json             # Dev-only tooling (linters, dev server) — never shipped
└── LICENSE
```

## Run it locally

No build step. From the repo root:

```bash
npm install    # one-time: dev tooling (linters + dev server)
npm run dev    # serves app/ at http://localhost:8000 and prints a LAN URL
```

`npm run dev` binds to your network, so you can open the printed LAN URL
(e.g. `http://192.168.x.x:8000`) on a **phone or tablet on the same Wi-Fi** to test on
real devices. Plain Python works too:

```bash
python -m http.server 8000 --directory app
```

**PWA note:** service workers only register over HTTPS or `localhost`. Over a LAN IP the
game plays fine, but offline/install won't activate — use a tunnel (cloudflared/ngrok)
or USB port-forwarding for on-device PWA testing.

## Development workflow

**Gitflow + a human-checkpointed loop** (roles detailed in [`AGENTS.md`](./AGENTS.md)):
plan (Opus) → **read (you)** → implement (Sonnet) → review (Opus) → **test on device
(you)** → push & PR (Sonnet) → CI (GitHub).

- **`main` is the only branch that publishes.** Merging to `main` runs the GitHub
  Actions **Pages deploy** of the `app/` folder. One-time setup: **Settings → Pages →
  Source → "GitHub Actions"**.
- **All work happens on feature branches** (`feature/<id>`), opened as PRs against `main`.
- **CI gates every PR.** Actions runs lint/format/HTML/link checks and uploads the site
  as a **downloadable artifact** so reviewers can test the branch. (For live per-PR
  preview URLs, add Cloudflare Pages/Netlify later — GitHub Pages hosts one site per repo.)
- **Branch protection** (one-time, after first push): **Settings → Branches** → require
  the CI status check to pass before merging to `main`.

Commits are small and focused, and **docs are updated in the same commit as the change
they describe**. Because the repo is public, commit messages are treated as documentation.

## Spec-driven development

This repo uses [GitHub Spec Kit](https://github.com/github/spec-kit) plus the
[TinySpec](https://github.com/Quratulain-bilal/spec-kit-tinyspec) extension:

- **Full SDD** (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`) for larger features.
- **TinySpec** (`/speckit-tinyspec-*`) for small changes — a single spec file under
  ~80 lines.
- Project principles live in [`.specify/memory/constitution.md`](./.specify/memory/constitution.md).

## Adding a game

Each game is a self-contained folder under `app/games/` plus one entry in the games
metadata (genre, age range, Hebrew title, icon, locked?). See the step-by-step guide in
[`AGENTS.md`](./AGENTS.md).

## Contributing

Forks and PRs welcome. Please read [`AGENTS.md`](./AGENTS.md) first — it documents
the conventions (RTL, no build step, storage rules) that keep games consistent.

## License

[PolyForm Noncommercial License 1.0.0](./LICENSE) © 2026 SilverShak.

Free to use, modify, and share **for non-commercial purposes only** — personal,
educational, hobby, charitable, and similar uses. Commercial use is not permitted.
This is a source-available (not OSI "open source") license, since open-source
licenses by definition allow commercial use.
