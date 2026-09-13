# TinySpec: Fast Calculation Game (חשבון מהיר)

**Branch**: feature/fast-calc
**Date**: 2026-09-12
**Status**: approved
**Complexity**: small
**Game id**: `fast-calc` — one identifier used everywhere: folder `app/games/fast-calc/`, manifest `id`, storage scope, this spec, and the branch.

## What

A timed mental-arithmetic game. On a start screen the kid picks three things —
**operation**, **max result** (difficulty), and **number of questions** (round
length). Each question shows `a <op> b = ▢` with three answer buttons; they tap the
correct result. At the end the finish time is shown with a big confetti celebration,
compared against the saved best time for that exact configuration ("faster/slower by N
seconds"), and the record is updated. Operations are pluggable: **addition,
subtraction, multiplication, and division** all ship; further operations are added by
dropping in a new definition — the round engine does not change.

Language, RTL, and i18n are platform concerns (see the constitution); this spec does
not choose a language — it just contributes its display strings to the shared i18n
layer.

## Context

| File                                     | Role                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| `app/games/fast-calc/index.html`         | New — start / play / finish screens (imports shared CSS/JS)             |
| `app/games/fast-calc/game.js`            | New — round + timer flow, records, confetti, operation dispatch         |
| `app/games/fast-calc/operations.js`      | New — pluggable operation defs (addition now); each owns its generation |
| `app/games/fast-calc/game.css`           | New — equation, answer buttons, confetti (logical properties)           |
| `app/games/manifest.js`                  | Modify — add `fast-calc` entry (genre math, age 5–9); add math genre    |
| `app/shared/js/storage.js`               | Context — best-time records via existing localStorage API (no changes)  |
| `app/shared/js/{i18n,nav,util,audio}.js` | Context — strings, header/back, `randomInt`/`shuffle`, feedback sounds  |

## Requirements

1. **Start screen**: (a) operation selector shown as the operator **symbol** (`+`, not the word) with an accessible label; (b) a **max-result slider** labelled operation-neutrally (**עד כמה** / "Up to how much", since it applies to +, −, ×, ÷ alike), snapping to {10, 20, 50, 100, 500, 1000} with a difficulty **color gradient** (green = easy/low → red = hard/high); (c) a **question-count slider** over {10, 15, 20} (default 10); (d) a **"הצגת שעון" (show-clock) checkbox** (⏱ icon + label, default on, persisted via settings) that toggles whether the live timer shows during play; (e) a **Start icon button** (▶ play) with an accessible label. Shows the player's best time for the selected `(operation, maxResult, questions)` — framed as "your record for these **game rules**" (Hebrew term: **כללי המשחק**, not "סוג/תצורה") — or a "no record yet" message.
2. **Pluggable operations** (registry in `operations.js`): each operation exports `{ id, symbol, labelKey, key(a,b), generate(maxResult, usedSet) → { a, b, text, answer } | null }`; the round engine never changes when one is added. Ships all four:
   - **Addition** (`add`, `+`): a,b ≥ 1, a + b ≤ max; **unordered** key.
   - **Subtraction** (`sub`, `−`): a ≤ max, 1 ≤ b ≤ a, answer = a − b ≥ 0; **ordered** key.
   - **Multiplication** (`mul`, `×`): a,b ≥ 1, a × b ≤ max; **unordered** key.
   - **Division** (`div`, `÷`): whole-number only — choose divisor b ≥ 2 and quotient c ≥ 1 with dividend a = b × c ≤ max; question is `a ÷ b`, answer c; **ordered** key.
     Each `generate` returns `null` once the config's unique combinations are exhausted.
3. Each question shows `a <symbol> b = ▢` and exactly three answer buttons, one correct. **Balance the correct answer's position** (slot 1/2/3) within a round: track how many times each slot has held the answer and place the next correct answer in the least-used slot (ties broken randomly), so it doesn't stay in the same spot.
4. Distractors: exactly three options including the correct one, all unique, ≠ correct, ≥ 0, and **near the correct answer** (spread scales with the answer's magnitude, with a small floor) so they stay plausible across all operations — including small `÷` answers.
5. **No repeats per round**: use each operation's canonical key at most once; if questions exceeds available unique keys for the config, cap it. **Also spread the answers**: track results already used this round and prefer a fresh result from the remaining pool each question (re-roll generation toward an unused result), only repeating a result once the config's distinct-result pool is exhausted — so a round can't pile up e.g. three sums of 20.
6. **Progress + round state** (both in-memory): (a) the used-keys set; (b) a **visual progress indicator — one dot per question that fills green as questions are completed** (current question highlighted, remaining neutral), with an accessible `role="progressbar"` / label so screen readers still get "question i of N". Round state is ephemeral — a mid-round reload simply restarts the round; records are unaffected. No `sessionStorage`.
7. **Storage**: best-time **records persist in `localStorage` via `storage.js`**, under **scope = the game id `fast-calc`** with record key `${op}-max${N}-q${M}` — i.e. full key `lg:fast-calc:add-max20-q10`. Namespacing by game id keeps records collision-free as more games are added. The game obtains its store via the shared **`scoped("fast-calc")`** helper in `storage.js` (the game id — matching its manifest entry — is the single scope declaration). The **show-clock** preference persists under the shared settings scope. Round/used-keys state is in-memory only. Nothing outside `storage.js` touches `localStorage`.
8. **Timer & in-game HUD**: a `performance.now()` timer started on the first question; **during play, show the live running timer — unless the "show clock" setting is off** — and, if a record exists for this config, the **current best time** (so the kid races it). Finish time shown in seconds (1 decimal). Time/record displays pair an **icon** with the text (⏱ for time, 🏆 for record) rather than text alone.
9. **Finish screen**: big confetti; finish time; gap vs prior record shown via i18n (faster-by-N / slower-by-N / new-record); persist best. Play-again + back-to-start.
10. Correct → a **quick success animation** on the chosen button (e.g. green pulse / ✓ pop, <500ms, respecting `prefers-reduced-motion`) plus the success sound, then the next question. Wrong → mark the chosen option as wrong and apply a **cooldown penalty** (default **3s**, tunable) that locks the answer buttons with a clear, kid-friendly countdown. **The timer keeps running during the cooldown** — the lost time is the penalty. The correct answer is not auto-revealed.
11. Follows platform conventions (constitution / AGENTS.md): direction-agnostic layout via CSS logical properties, all user-facing text via the shared i18n layer (no hard-coded strings), shared CSS tokens, button-first minimal text, self-contained confetti (no external lib), relative subpath-safe paths; appears on the portal via its manifest entry. Hebrew copy is **gender-neutral**, **simple/clear for kids**, and **spells out units** ("שניות", not "שנ׳").

## Plan

1. Add `fast-calc` entry to `app/games/manifest.js` (+ math genre); add i18n strings (title, operation labels, selectors, feedback, records).
2. `operations.js`: the four operations (add/sub/mul/div) behind a small registry the start screen reads.
3. `index.html`: three views (start / play / finish) toggled by JS; shared header/back.
4. `game.js`: round controller (timer, in-memory progress + used-keys, no-repeat via operation key, feedback), `makeOptions(answer, maxResult)`, records load/compare/save (localStorage via `storage.js`, scope `fast-calc`), confetti burst.
5. `game.css`: equation + 3-button grid + confetti; logical properties; ≥48px targets; responsive.
6. Wire correct/wrong/celebration sounds via `audio.js` (graceful if files absent).

## Tasks

- [ ] Operation registry + all four operations add/sub/mul/div (`operations.js`)
- [ ] Manifest entry (+ math GENRES value) and i18n strings
- [ ] `index.html` (start / play / finish views, shared imports)
- [ ] `makeOptions` + in-memory no-repeat via operation key + count cap
- [ ] Timer, progress counter, feedback, finish flow
- [ ] Records: scope `fast-calc`, key by `(op, max, questions)`, compare, gap via i18n, persist best
- [ ] Confetti celebration + correct/wrong audio
- [ ] Style layout (logical properties, touch targets, responsive)
- [ ] Manual test at phone width; record + gap persist across reload; round restarts cleanly on reload
- [ ] `npm run lint`, `format:check`, `validate:html`, `check:links` all pass

## Done When

- [ ] All tasks checked off
- [ ] A round for each operation (add/sub/mul/div) runs timed with no repeats; finish shows time + confetti
- [ ] Best time per `(op, max, questions)` persists in localStorage; faster/slower gap shows next play
- [ ] Adding a future operation needs only an `operations.js` entry + i18n label
- [ ] All four project checks pass with no errors
