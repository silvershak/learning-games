<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR: new normative guidance added to an existing
  principle; no principle renamed, removed, or redefined incompatibly)
- Modified principles: IV. Kid-First, Accessible UX — added two rules: (a) "less text,
  more icons" (default to icon-only; add a label/tooltip only when the icon alone
  wouldn't be understood, without weakening the control's accessible name), and (b)
  "pre-play screens fit one viewport, no scrolling" (portal and any setup/options
  screen must show every choice plus the primary action without scrolling)
- Added sections: none (both are expansions within existing Principle IV, not new
  sections)
- Removed sections: none
- Templates/commands requiring updates: none identified — these are UX constraints on
  game screens, not on the Spec Kit workflow templates themselves. TinySpecs for
  existing games (fast-calc, numbers-maze, memory-match) are unaffected retroactively;
  new/changed setup screens should be checked against both rules going forward.
- Follow-up TODOs: none
- Origin: learned while building memory-match's setup screen (specs/tiny/memory-match.md,
  Decisions 20-22) — a setup screen with too many option cards required scrolling to
  reach the start button, and needed several rounds of text-trimming (pair counts,
  category labels) to fit; the human asked for both lessons to be captured as
  project-wide principles, not one-off fixes.
-->

# Learning Games (משחקי למידה) Constitution

A collection of small, client-side learning games for kids, published as a static
site on GitHub Pages. This constitution states the platform-level principles that all
games and contributions inherit. Operational detail lives in `AGENTS.md`, which must
stay consistent with this document.

## Core Principles

### I. Static & Client-Side Only

Served as static files with no server, database, login, or accounts. All logic runs in
the browser; nothing the user does leaves their device. Anything shipped is public —
never embed secrets. There is no trust boundary to defend: treat all client-side state
as user-editable.

### II. Vanilla, No Build Step

Plain HTML, CSS, and JavaScript (ES modules). No framework, no bundler, no build step;
files are served as authored. Multi-page: a portal plus one self-contained folder per
game. Dev-only linters/formatters may exist for CI but must never ship to the browser.
Introducing a framework or build step requires an explicit amendment to this document.

### III. Language & Internationalization

Supported UI languages are declared here, at the platform level; individual games do
NOT choose their language. Current: **Hebrew (`he`), the default, rendered
right-to-left (RTL)**. Planned: **English (`en`), LTR**. All user-facing text must go
through the shared i18n layer — no hard-coded strings in markup — and layout must be
direction-agnostic (CSS logical properties only, never physical left/right). A new
language is therefore added centrally without touching game logic. Games contribute
their strings to i18n; they never restate or override the language policy. Hebrew copy
must be **gender-neutral (unisex)** — prefer forms identical for any gender (e.g. the
singular «סיימת», «שלך»); when a phrase cannot be made neutral, ask which form to use
rather than defaulting to masculine.

### IV. Kid-First, Accessible UX

Button-first, minimal-text interfaces suitable for young children. Large touch targets
(≥44px), responsive for phone and tablet, visible focus states, sufficient color
contrast, and no reliance on reading where an icon or sound will do. Copy is **simple
and clear** for young kids, **spells words out** (no abbreviations — e.g. «שניות», never
«שנ׳»), and **pairs an icon with text** wherever it aids comprehension.

**Less text, more icons.** Default to the icon alone; add a text label only when the
icon by itself would not be understood, not as a matter of course. Where an option must
be identified by more than an icon (e.g. many similar choices in a compact control), a
short label or a tooltip is preferable to a permanently visible line of text if it keeps
the screen more compact — but never at the cost of the control's accessible name (a
control's actual name for assistive tech must still identify it; a visual-only
tooltip is not a substitute).

**Pre-play screens MUST fit one viewport, no scrolling.** The portal, and any
setup/options screen a game shows before a round starts, must show every choice and
the primary action (e.g. "start") within a single typical phone viewport, with no
scrolling needed to reach any of them. This governs only the screens a player must get
through *before* play begins — a gameplay screen that legitimately needs to scroll once
play is underway (e.g. a large game board) is not covered. When a screen has too many
options to fit within one viewport as big tappable cards, prefer a more compact native
control (e.g. a `<select>`, an icon-only row) over adding scrolling or a wizard step.

### V. One Storage Gateway

All persistence goes through the single shared storage module — games never touch
`localStorage`/`sessionStorage` directly. Durable data (progress, records, settings)
uses `localStorage`; ephemeral within-round state may simply live in memory. Keys are
namespaced; stored data is untrusted.

### VI. Subpath-Safe Paths

The site is served from a subpath (e.g. `/learning-games/`). All references — links,
assets, service-worker scope, manifest — must be relative and work under that subpath,
never root-absolute.

## Development Workflow

- **Spec-driven**: use Spec Kit. TinySpec (`specs/tiny/`) for small changes and single
  games; full SDD for cross-cutting work.
- **Gitflow**: feature branches → Pull Request → CI must pass → merge to `main`.
  `main` is the only branch that deploys (GitHub Pages, deploy-from-branch).
- **Quality gates**: lint, format, HTML validation, and link checks pass before merge.
  An AI code review (Opus) complements, but does not replace, the automated gate.
- **Docs with code**: update `README.md`, `AGENTS.md`, and specs in the same commit as
  the change they describe. The repository is public — commit messages are documentation.

## Governance

This constitution supersedes other practices. Where `AGENTS.md` and this document
conflict, the constitution wins and `AGENTS.md` is corrected. Amendments are made by
editing this file in a normal Pull Request that notes the change and bumps the version.
Complexity that violates a principle must be justified in the relevant spec, or rejected.

**Version**: 1.1.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-15
