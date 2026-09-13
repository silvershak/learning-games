# TinySpec: Numbers Maze (מבוך המספרים)

**Branch**: feature/numbers-maze
**Date**: 2026-09-13
**Status**: draft
**Complexity**: small
**Game id**: `numbers-maze` — one identifier used everywhere: folder `app/games/numbers-maze/`, manifest `id`, storage scope, this spec, and the branch.

## What

A counting game for the youngest players. On a start screen the kid picks **how many
numbers** to play with (10, 25 or 50) as big tappable cards. A grid of numbers
appears; hidden inside it is a snaking route `1, 2, 3 … N` where every consecutive
number sits in an **orthogonally adjacent** cell (up/down/left/right — never diagonal).
Every other cell holds a plausible distractor number. The kid puts a finger on `1` and
drags along the route; cells reached **in order** turn green and stay green, a wrong
cell just **flashes red with no penalty and no loss of progress**, and reaching `N` wins
with a celebration and a play-again choice.

The game teaches number order and counting by recognition, not arithmetic — there is
**no timer and no score**, deliberately, because the audience is ages 3–5.

Language, RTL, and i18n are platform concerns (see the constitution); this spec does not
choose a language — it just contributes its display strings to the shared i18n layer.

## Context

| File                                        | Role                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| `app/games/numbers-maze/index.html`         | New — start / play / win screens (imports shared CSS/JS)                               |
| `app/games/numbers-maze/maze.js`            | New — **pure** board model: grid table, path generation, distractor fill               |
| `app/games/numbers-maze/game.js`            | New — view switching, pointer-drag controller, storage, win flow                       |
| `app/games/numbers-maze/game.css`           | New — count cards, grid, cell states (logical properties)                              |
| `app/games/manifest.js`                     | Modify — add `numbers-maze` entry (genre מתמטיקה, age 3–5); GENRES unchanged           |
| `app/shared/js/i18n.js`                     | Modify — add `numbersMaze.*` strings to both the `he` and `en` tables                  |
| `app/shared/js/confetti.js`                 | New — confetti extracted from `fast-calc/game.js` so both games share it               |
| `app/games/fast-calc/game.js`               | Modify — import the extracted confetti instead of its local copy                       |
| `app/service-worker.js`                     | Modify — add `shared/js/confetti.js` to `PRECACHE_URLS` (game files are not precached) |
| `app/shared/js/{storage,nav,util,audio}.js` | Context — `scoped()`, header/back, `randomInt`/`shuffle`/`sample`, sounds              |

## Requirements

1. **Start screen**: a prompt plus three big count cards — **10, 25, 50** — each
   a ≥88px tappable card showing the numeral large (the numeral itself is the main
   affordance; a 3-year-old who cannot read still recognises it). A card the player has
   completed before carries a small ⭐ badge with an accessible label. The last-played
   count is pre-highlighted. Picking a card starts a round immediately — no separate
   start button, one tap to play.

2. **Grid dimensions — fixed per count, portrait-shaped, always fully visible.** The
   board never scrolls and never pans; it is sized with `aspect-ratio: cols / rows` plus
   `max-inline-size`/`max-block-size` so the whole grid always fits the viewport:

   | Count `N` | cols × rows | cells | distractors | fill | cell size @360×640 phone |
   | --------- | ----------- | ----- | ----------- | ---- | ------------------------ |
   | 10        | 4 × 4       | 16    | 6           | 63%  | ~85px                    |
   | 25        | 5 × 7       | 35    | 10          | 71%  | ~68px                    |
   | 50        | 7 × 10      | 70    | 20          | 71%  | ~48px                    |

   Rationale: (a) **portrait shape** (rows ≥ cols) matches a phone held upright, which is
   how the board is actually played; (b) **~1.35–1.6× N cells** keeps distractor density
   meaningful while leaving the generator enough slack to route without heavy
   backtracking; (c) **no scrolling** — a scrollable board and a drag gesture fight each
   other, and mid-drag scrolling would be unusable at this age, so fitting the board is
   preferred over enlarging cells.
   **75 and 100 are out of scope for this version** (decided: cell sizes below the 44px
   touch-target guideline aren't worth the trade-off at this age; the count picker only
   offers 10/25/50, all of which clear 44px comfortably).
   **Rotation/tablet**: the board keeps its per-count `cols × rows` and merely rescales
   to the new viewport — the layout is never regenerated, so rotating the device mid-game
   never destroys the board or the progress.

3. **Path generation** (`maze.js`, pure, no DOM) — produce a non-self-intersecting
   orthogonal path of **exactly** N cells in the `cols × rows` grid:
   1. Choose a uniformly random start cell.
   2. Randomised **depth-first search with backtracking**: from the current cell,
      consider the four orthogonal neighbours that are unvisited and in-bounds.
   3. Order those candidates by a **Warnsdorff-style heuristic** — fewest onward
      unvisited neighbours first, random tie-break. This makes the path hug walls and
      snake naturally instead of wandering, and sharply cuts backtracking.
   4. **Connectivity prune**: before descending into a candidate, flood-fill the
      unvisited region reachable from it; if that reachable count (candidate included)
      is smaller than the number of cells still needed, prune the branch. This is what
      stops the search from sealing itself into a pocket. It is a _necessary_ not
      _sufficient_ condition — a reachable region can still have a bottleneck — so
      backtracking is still required and must not be removed.
   5. Succeed the moment `path.length === N`.
   6. **Guaranteed termination**: cap node expansions at 20,000 per attempt and restart
      from a fresh random start up to 10 times. If every attempt fails, fall back to a
      deterministic **boustrophedon** path (serpentine row-by-row through the first
      `ceil(N / cols)` rows, trimmed to exactly N). The fallback guarantees the game
      always starts; it is a correctness backstop, not a nicety.
      Cost is trivial at this size (≤135 cells, flood-fill ≤4× per step) — generation must
      complete well under one animation frame; no loading state is needed.

4. **Distractors** — fill every non-path cell so the board reads as one number family
   and the puzzle is a genuine search:
   - Pool = `1 … max(N, 12)`. Same range as the path, so a kid cannot solve the board by
     spotting "the odd numbers out"; the floor of 12 keeps the N=10 board varied while
     staying inside numbers a 3-year-old knows.
   - **Hard rule A**: a distractor `v` must never be placed **orthogonally adjacent to
     the path cell holding `v − 1`**. Otherwise the child standing on `v − 1` would see
     two equally legal-looking `v` cells — the one genuinely confusing collision, and
     the one this rule exists to forbid.
   - **Hard rule B**: the values `1` and `N` each appear **exactly once** on the whole
     board. A duplicate `1` makes the start unfindable; a duplicate `N` fakes a finish.
   - Soft rule: prefer values used fewer times so far, so no single value carpets the
     board. Duplicates are otherwise expected and fine (35 distractors from a pool of
     100 is a different problem than 6 from a pool of 12).
   - Placement: sample from the pool, rejecting rule violations; after 20 rejections for
     a cell, scan the pool for any legal value. A legal value always exists — at most 4
     values are forbidden per cell against a pool of ≥12.

5. **Drag interaction** — one rule, applied identically to every input:
   - **Pointer Events only** (`pointerdown` / `pointermove` / `pointerup` /
     `pointercancel`) — a single code path for touch, mouse and pen. Call
     `setPointerCapture` on the board so moves keep arriving after the finger strays off
     a cell or off the board edge. Board gets `touch-action: none` so the browser never
     steals the gesture (safe precisely because the board never scrolls, per req. 2).
   - Hit-testing resolves the cell via `document.elementFromPoint(x, y).closest(".maze__cell")`
     rather than per-cell `pointerenter`, because pointer capture redirects events to the
     board. Throttle resolution to once per `requestAnimationFrame`.
   - State is a single integer `progress` — the highest number correctly reached (0 means
     "looking for 1"). **`pointerdown` and `pointermove` both call the same `visit(cell)`**,
     which is the whole interaction model:
     - cell holds `progress + 1` → **accept**: paint it green permanently, `progress++`,
       success sound, announce to the live region; if `progress === N`, win.
     - cell is already green → **silent no-op**. Dragging back over your own trail must
       never punish.
     - anything else → **flash red ≤400ms** on that cell. No progress change, no lockout,
       no cooldown, no sound of failure beyond a soft bump.
   - Because a wrong cell changes _nothing_, **dragging off a wrong cell straight onto the
     correct next cell in one continuous motion just works** — the next resolved move
     accepts it. The wrong cell is explicitly **not sticky**.
   - **Resume after lifting**: `pointerup` ends the gesture but **never resets progress**.
     The next `pointerdown` runs the same `visit(cell)`, so re-touching the last correct
     cell (a no-op) or the next number (a legal single step) both continue the round, and
     touching anywhere else merely flashes red. **Skipping is structurally impossible** —
     only `progress + 1` ever advances the state — so no extra anti-skip logic is needed.
   - Falls out for free: **tap-by-tap play** works identically to dragging, for a child who
     has not got the hang of dragging yet.
   - Fast flicks are not interpolated between move samples: a jump that lands off-route is
     simply a wrong cell (red flash), which is the correct behaviour anyway.

6. **Play screen chrome**: shared header + back button; a **next-number hint chip**
   ("המספר הבא: {next}") that always shows the number to hunt for — the single most
   valuable support at this age; and a progress line ("הגעת עד {current} מתוך {total}").
   No timer, no score, no failure state.

7. **Win**: the completed route replays as a quick 1→N sequential pulse (a "victory
   trace"), then confetti and a big unisex "כל הכבוד!". Two large buttons: **עוד פעם**
   (same count, freshly generated board) and **לבחור מספר אחר** (back to the picker).
   Confetti is the existing self-contained implementation, extracted from
   `fast-calc/game.js` into `app/shared/js/confetti.js` and imported by both games.

8. **Storage** — via the shared **`scoped("numbers-maze")`** helper only, scope = the game
   id, matching its manifest entry. Deliberately no records or times (no competitive
   pressure at 3–5):
   - `lg:numbers-maze:last-count` → number — the count last played, used to pre-highlight
     a card. Validate it is one of `[10, 25, 50]` before use.
   - `lg:numbers-maze:completions` → `{ "10": 3, "25": 1, … }` — completions per count,
     powering the ⭐ badge. Coerce non-numeric/negative values to 0 on read.
     Stored data is untrusted and user-editable; a corrupt value must degrade to the
     default, never throw.
   - **Not persisted**: the board and mid-round progress. A reload starts a fresh board,
     matching `fast-calc`'s ephemeral round state (decided: simplicity over persistence).

9. **RTL for a grid** — the board is a _spatial_ puzzle, not text, and needs **no
   direction special-casing**:
   - Adjacency is topological (row/col indices), so the generated path is identical in
     either direction. Under `dir="rtl"` CSS Grid flows the inline axis right-to-left, so
     column 0 renders at the **right** edge — which is correct for a Hebrew UI.
     **Do not force `direction: ltr` on the board** to "fix" this.
   - Numerals are rendered correctly in an RTL context by the bidi algorithm with no
     per-cell `dir`; use `font-variant-numeric: tabular-nums` for even sizing.
   - `elementFromPoint` is direction-agnostic.
   - All chrome uses logical properties only (`padding-inline`, `inset-inline-start`,
     `text-align: start`) — never physical left/right.

10. **Accessibility**: cells are real `<button>`s inside a `role="grid"`, each with
    `aria-label` "מספר {value}" and a visible focus ring; Enter/Space runs the same
    `visit(cell)`, so keyboard play works. A `aria-live="polite"` status announces
    "הגעת ל-{value}". Red flash and victory pulse both respect `prefers-reduced-motion`
    (falling back to a static tint rather than a shake or pulse). Green/red are paired
    with a shape/weight change, never colour alone.

11. **i18n strings** (`numbersMaze.*`, added to both `he` and `en` tables): `title`,
    `start.prompt`, `start.count`, `start.completed`, `play.instruction`, `play.next`,
    `play.progress`, `cell.label`, `a11y.reached`, `win.title`, `win.body`,
    `win.playAgain`, `win.changeCount`. Hebrew copy is **gender-neutral** — use the unisex
    singular ("הגעת", "עברת", "סיימת") and phrase instructions as **infinitives**
    ("להתחיל מהמספר 1 ולהחליק עד {total}") rather than plural imperatives, which are not
    truly unisex. Words are **spelled out** (no abbreviations) and paired with an icon
    where it helps. Title: **מבוך המספרים**.

12. **Manifest entry** — the implementer adds exactly this to `app/games/manifest.js`;
    `GENRES` needs no change because `"מתמטיקה"` already exists:

    ```js
    {
      id: "numbers-maze",
      title: "מבוך המספרים",
      genre: "מתמטיקה",
      minAge: 3,
      maxAge: 5,
      icon: "🔢",
      path: "games/numbers-maze/index.html",
      locked: false,
    },
    ```

    The portal already ships a **3–5** age band, which a 3–5 game matches, so no portal
    code changes at all.

13. Follows platform conventions (constitution / AGENTS.md): static and client-side only,
    vanilla ES modules with no build step, relative subpath-safe paths, shared CSS tokens,
    all text through the shared i18n layer, all persistence through `storage.js`, confetti
    self-contained with no external library.

## Decisions (resolved before implementation)

1. **75 and 100 dropped from scope.** The count picker offers only **10, 25, 50** — all
   comfortably clear the 44px touch-target guideline at the grid sizes in req. 2. No
   staged-board mechanic is needed.
2. **Confetti extracted** to `app/shared/js/confetti.js`, shared by `fast-calc` and
   `numbers-maze`, per req. 7.
3. **No persistence of board/progress** — a reload always starts a fresh board (req. 8).
   Only `last-count` and `completions` persist.
4. **Portal age-filter mismatch** (`AGENTS.md` documents overlap; `portal.js:30`
   implements containment) is a **pre-existing bug, unrelated to this feature**. It will
   be fixed as its own small, separate commit on this branch — not mixed into the
   numbers-maze diff — since it doesn't affect this game (a 3–5 game matches the 3–5 band
   under either reading).
5. **Scope note.** This tinyspec touches 8 files (plus one standalone portal-bugfix
   commit), above the 1–5 rule of thumb, but the overflow is one-line additive edits
   (manifest, i18n, precache) plus the confetti extraction; the game itself is 4
   self-contained files, matching the `fast-calc` precedent. Full SDD is not warranted.

## Plan

1. `maze.js`: `GRID_BY_COUNT` table, `generatePath(cols, rows, n)` (DFS + Warnsdorff +
   flood-fill prune + restart cap + boustrophedon fallback), `fillDistractors(grid, path)`,
   `buildBoard(count)` returning `{ cols, rows, cells, pathIndex }`.
2. Extract confetti from `fast-calc/game.js` to `app/shared/js/confetti.js`; update the
   `fast-calc` import; add the file to `PRECACHE_URLS`.
3. `index.html`: three views (start / play / win) toggled by JS; shared header/back.
4. `game.js`: count picker (+ ⭐ badges from storage), board render, the `visit(cell)`
   pointer controller, hint chip + progress, win flow, storage reads/writes.
5. `game.css`: count cards, `aspect-ratio` board that always fits, cell states
   (neutral / green / red flash / focus), collapsing gap and `clamp()` font at small cell
   sizes, `touch-action: none`, `prefers-reduced-motion` fallbacks — logical properties
   throughout.
6. Manifest entry + `numbersMaze.*` strings in both language tables.
7. Wire success/bump/celebration sounds via `audio.js` (graceful if files are absent).

## Tasks

- [ ] `maze.js` — grid table, path generator with prune + fallback, distractor fill
- [ ] Verify generator: 200 boards per count all yield exactly N cells, orthogonally
      adjacent, no repeats, and never hit the boustrophedon fallback
- [ ] Extract `shared/js/confetti.js`, update `fast-calc`, add to `PRECACHE_URLS`
- [ ] Manifest entry + `numbersMaze.*` strings (`he` + `en`)
- [ ] `index.html` (start / play / win views, shared imports)
- [ ] Count picker with ⭐ completion badges and last-count highlight
- [ ] Board render + `visit(cell)` pointer controller (drag, resume, tap, keyboard)
- [ ] Green persist / red flash / victory trace / confetti, with reduced-motion fallbacks
- [ ] Storage: `last-count`, `completions`, both validated on read
- [ ] Style (logical properties, fit-always board, collapsing gap, responsive)
- [ ] Manual test on a real phone: every count fits without scrolling; drag never scrolls
      the page; lift-and-resume keeps progress; rotation preserves the board
- [ ] `npm run lint`, `format:check`, `validate:html`, `check:links` all pass
- [ ] Separate commit (not mixed with the above): fix `portal.js:30` age-filter to match
      the overlap behavior documented in `AGENTS.md` (pre-existing bug, unrelated to
      numbers-maze's own correctness)

## Done When

- [ ] All tasks checked off
- [ ] Every count (10/25/50) generates a valid 1→N orthogonal route with plausible
      distractors and no adjacent duplicate of the next expected number
- [ ] A round can be completed by continuous drag, by lift-and-resume, and by tapping —
      and wrong cells never cost progress
- [ ] Boards for all three counts fit a 360×640 phone with no scrolling
- [ ] `last-count` and `completions` persist across reload; corrupt values degrade safely
- [ ] The game appears on the portal under מתמטיקה and the 3–5 band with no portal changes
- [ ] All four project checks pass with no errors
