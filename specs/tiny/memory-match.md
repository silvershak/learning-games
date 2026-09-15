# TinySpec: Memory Match (משחק הזיכרון)

**Branch**: feature/memory-match
**Date**: 2026-09-15
**Status**: draft
**Complexity**: small
**Game id**: `memory-match` — one identifier used everywhere: folder `app/games/memory-match/`, manifest `id`, storage scope, this spec, and the branch.

## What

The classic pairs-matching (concentration) game. On a setup screen the player picks three
things as big tappable cards — **board size** (4×4 / 8×8 / 16×16), **card type** (the
visual content on a card's face: emoji glyphs or colored shapes), and **number of
players** (1 or 2) — then the round starts.

Every card starts face-down. Tapping a card flips it face-up; tapping a second card
either **matches** (both stay face-up, locked in place for the rest of the round) or
**doesn't** (both flip back face-down after a short, fixed pause). Input is locked while
a pair resolves, so a third card can never be flipped mid-resolution. The round ends when
every pair is found.

In **1 player** the round is a calm solo hunt: a progress line ("מצאת 3 מתוך 8 זוגות"),
no timer, no move counter, no record — deliberately, matching `numbers-maze`'s restraint
for young players. In **2 players** a header shows whose turn it is and each player's
live pair count; **a match keeps the turn, a miss passes it**; at the end the higher pair
count is named (ties handled explicitly, and never as a loss for anyone).

There are **no photographic images anywhere**. A card face is a single large glyph (emoji)
or a single large inline-SVG shape in one flat color, sized to dominate the card the way a
picture would. Card backs are identical for every card and leak nothing about the type.
All flip/match motion is plain CSS and respects `prefers-reduced-motion`.

Language, RTL, and i18n are platform concerns (see the constitution); this spec does not
choose a language — it just contributes its display strings to the shared i18n layer.

## Context

| File                                        | Role                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `app/games/memory-match/index.html`         | New — setup / play / end screens (imports shared CSS/JS)                                  |
| `app/games/memory-match/cards.js`           | New — **pure** face registry (emoji pool, color-shape generator) + `buildDeck()`          |
| `app/games/memory-match/game.js`            | New — view switching, flip controller, turn/score model, storage, end flow                |
| `app/games/memory-match/game.css`           | New — setup cards, board grid, 3D flip, player colors (logical properties)                |
| `app/games/manifest.js`                     | Modify — add `memory-match` entry (genre זיכרון, ages 3–8); `GENRES` unchanged            |
| `app/shared/js/i18n.js`                     | Modify — add `memoryMatch.*` strings to both the `he` and `en` tables                     |
| `app/shared/js/confetti.js`                 | Context — **reused as-is** for the end screen; already extracted for `numbers-maze`       |
| `app/service-worker.js`                     | Context — **no change**: no new shared module, and per-game files are not precached       |
| `app/shared/js/{storage,nav,util,audio}.js` | Context — `scoped()`, header/back, `shuffle`/`randomInt`/`sample`, sounds                 |

## Requirements

1. **Setup screen** — three parameter groups, each a labeled row of big tappable option
   cards (≥`--touch-target-min`, same affordance style as `fast-calc`'s option groups),
   plus one primary **התחלה** button. One screen, no wizard: a 6-year-old should see all
   three choices at once and a 3-year-old can just hit התחלה on the defaults.

   1. **גודל הלוח** — three options. Each card shows the grid shape, a friendly name, and
      the pair count spelled out, because "16×16" means nothing to a 5-year-old but
      "128 זוגות" and a visibly denser icon do:

      | Option | Grid  | Cards | Pairs | Name (he) |
      | ------ | ----- | ----- | ----- | --------- |
      | small  | 4×4   | 16    | 8     | קטן       |
      | medium | 8×8   | 64    | 32    | בינוני    |
      | huge   | 16×16 | 256   | 128   | ענק       |

      The **ענק** card additionally shows a quiet hint line (`setup.size.hugeHint`:
      "לוח גדול — צריך לגלול, ומתאים יותר למסך גדול") so the choice is informed rather
      than a surprise. It is **not** disabled — see req. 3 and Decision 4.

   2. **סוג הקלפים** — driven by the **type registry** in `cards.js` (req. 4), not a
      hardcoded pair of branches. Ships with two types, `emoji` and `colors`; adding a
      third is one registry entry plus its strings, with no change to `game.js` or the
      setup rendering loop.

   3. **כמה שחקנים** — `1` or `2`, shown as a numeral plus an icon (👤 / 👥).

   Defaults come from `last-setup` in storage (req. 9), falling back to
   **4×4 / emoji / 1 player** — the gentlest combination, correct for the youngest end of
   the age range. Every option card is a real `<button>` with `aria-pressed` reflecting
   selection; selection is shown by a filled state **and** a ✓ mark, never color alone.

2. **Deck construction** (`cards.js`, pure, no DOM):
   - `buildDeck(sizeId, typeId)` → `{ cols, rows, cards }` where `cards` is an array of
     `{ id, faceKey }` of length `cols * rows`, each `faceKey` appearing **exactly twice**.
   - Faces are sampled from the type's pool by **walking the pool's families in shuffled
     order, taking one face per family per pass** until `pairs` faces are collected. This
     matters at small sizes: a naive `shuffle(pool).slice(0, 8)` can hand a 4×4 board eight
     fruits that all read as "roundish and red-ish"; round-robin across families
     guarantees a visually spread hand. At 16×16 the whole pool is used and the walk is a
     no-op.
   - Each chosen face is duplicated and the resulting array is shuffled with the shared
     `shuffle()` from `util.js`.
   - Pure and synchronous: 256 cards is trivial work, well under one animation frame — no
     loading state.

3. **Board layout, touch targets, and the 16×16 problem** — the board is a CSS Grid of
   square cells. JS sets only two custom properties on the board element (`--mm-cols` and
   `--mm-gap`); **all sizing is CSS**, so a resize or a device rotation merely rescales the
   existing board and never regenerates the deck or loses progress.

   ```css
   --mm-cell: clamp(44px, calc((100vw - 2 * var(--space-4)
              - (var(--mm-cols) - 1) * var(--mm-gap)) / var(--mm-cols)), 96px);
   ```

   - **44px is a hard floor, never violated.** AGENTS.md's touch-target rule wins over
     "everything on one screen". The 96px cap stops a 4×4 board becoming absurd on a
     desktop.
   - **Tier A — fits, no scrolling.** When `cols × cell + gaps` fits the viewport the board
     is centered and nothing scrolls. On a 360×640 phone: 4×4 → ~78px cells. On a 390px
     phone: 8×8 → ~45px. On a tablet or desktop: 8×8 → 90px+, and even 16×16 fits at the
     44px floor (16 × 44 + 15 × 2 = 734px).
   - **Tier B — the board scrolls (documented, deliberate exception).** When the floor
     can't be met — 16×16 on any phone, 8×8 on a narrow (<380px) phone — the cells stay at
     44px and the **board container** scrolls in both axes
     (`overflow: auto; overscroll-behavior: contain`), while the page itself never scrolls
     horizontally.

     Rationale, and why this differs from `numbers-maze` req. 2 (which forbids scrolling
     outright): that game's input is a **continuous drag**, and a drag gesture and a scroll
     gesture fight each other, so shrinking the board below the touch floor was never an
     option there. Memory Match's input is a **discrete tap**. Tap and scroll coexist
     perfectly — this is how every card game on a phone already works — so the trade-off
     resolves the other way: keep fat, tappable, legible cards and let the player pan.
     Consequently the board must **not** set `touch-action: none` (the opposite of
     `numbers-maze`); leave the default so the browser handles panning.

   - **Pair peek strip** — on a scrolling board the two cards you just turned over can be
     far apart, and a 4-year-old cannot hold "row 12" in their head while panning. When the
     board is actually scrollable (`scrollWidth > clientWidth || scrollHeight > clientHeight`,
     re-evaluated on `resize` via a `ResizeObserver`), a small sticky strip under the header
     shows the faces of the **currently revealed** card(s) — nothing else, so it leaks no
     information the player has not already turned over. On a Tier A board the strip is
     absent entirely.
   - **Never reflow the board.** Matched cards stay in their cells (req. 6). Removing them
     would reflow the grid, destroy the positional memory the entire game is built on, and
     move cards out from under a finger mid-tap.

4. **Card types — a registry, not a boolean** (`cards.js`). A type is:

   ```js
   { id, labelKey, icon, faces() }  // faces() -> Face[]
   ```

   A `Face` is a render descriptor, not markup:
   `{ key, kind: "emoji" | "shape", family, glyph?, shape?, hue?, fill?, name: { he, en } }`.
   `game.js` renders a face purely from `kind` — so a new type that reuses `kind: "shape"`
   needs zero renderer changes.

   **Both shipped types supply ≥128 faces, so no type × board-size combination is ever
   restricted** (see Decision 2 for why this beats disabling combinations):

   - **`emoji` — a curated pool of exactly 128 glyphs, 8 families × 16**, chosen for
     kid-familiarity and for staying distinguishable at a 44px cell. The list is fixed
     content, written out in `cards.js`:

     | Family (he)   | Glyphs                                              |
     | ------------- | --------------------------------------------------- |
     | חיות          | 🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔                       |
     | ציפורים וים   | 🐧🦅🦆🦉🦜🐢🐍🐙🦑🦀🐬🐳🐟🐠🦈🦐                       |
     | חרקים וגינה   | 🐝🐛🦋🐌🐞🕷🌸🌻🌷🌹🌼🍀🌲🌴🌵🍄                       |
     | פירות וירקות  | 🍎🍌🍇🍓🍉🍊🍋🍒🍑🥝🥕🌽🥦🍅🥑🍆                       |
     | אוכל          | 🍞🧀🍕🍔🌭🍟🥨🍪🍩🎂🍭🍫🍿🥞🍦🍯                       |
     | כלי תחבורה    | 🚗🚕🚌🚒🚑🚓🚜🚲🛵🚂🚀✈️🚁⛵🚢🛶                       |
     | שמיים וטבע    | ☀️🌙⭐🌈☁️⛄❄️🔥💧🌊⚡🌍🌋🏔🏖🌪                       |
     | חפצים ומשחק   | ⚽🏀🎾🎈🎁🧸🎨🖍✏️📚🔔🥁🎸🎺🔑⏰                       |

     Rendered as text at `font-size: calc(var(--mm-cell) * 0.62)` with
     `line-height: 1` — the glyph fills the card like a picture would, it is not inline
     text. Each entry carries its own `name: { he, en }` used for the accessible label
     (Decision 3).

   - **`colors` — 128 generated faces: 8 hues × 8 shapes × 2 fills.** Flat color alone
     cannot do this: ~128 distinct swatches would be pastel micro-steps that a 3-year-old
     cannot tell apart, and pairing by near-identical blues is a guessing game, not a
     memory game. Combining a **strongly saturated hue** with a **silhouette** and a
     **solid/outline** treatment gives 128 combinations that stay legible at 44px and stay
     distinguishable for color-vision deficiency (shape carries the difference when hue
     doesn't).

     | Axis   | Values                                                                             |
     | ------ | ---------------------------------------------------------------------------------- |
     | hue    | אדום `#e23b2e`, כתום `#ef7f18`, צהוב `#f2c40c`, ירוק `#2f9e44`, טורקיז `#0d9488`, כחול `#2b5fd9`, סגול `#7c3aed`, ורוד `#e857a6` |
     | shape  | עיגול, ריבוע, משולש, מעוין, כוכב, לב, פלוס, סהר                                     |
     | fill   | מלא (solid), קו (outline)                                                           |

     Shapes are **inline SVG paths** from a `SHAPE_PATHS` map (a 100×100 `viewBox`, one
     `<path>` per shape) — crisp at any cell size, no image files, no `clip-path`
     guesswork for star/heart/moon. Solid = `fill: <hue>; stroke: none`; outline =
     `fill: none; stroke: <hue>; stroke-width: 12`. `family` for the round-robin sampler
     is the **hue**, so a small board never comes up all-blue.
     The SVG is `aria-hidden`; the accessible name comes from the composed label (req. 11).

5. **Flip interaction — one entry point, one lock.** Every input path (pointer tap,
   Enter/Space on a focused card) calls the same `flipCard(index)`. The whole model is a
   small state machine, and getting it exactly right is the point of this requirement,
   because a third card flipped mid-resolution is the classic bug in this genre:

   - `flipCard(index)` returns immediately, doing nothing, when **any** of:
     `state.busy` is true; the card is already matched; the card is already the currently
     revealed first card (tapping the same card twice must never "match it with itself");
     or no round is in progress.
   - **First card**: set face-up, remember it, announce it. No timers, no lock.
   - **Second card**: set face-up, then **set `state.busy = true` immediately**, before any
     timer is scheduled — the lock is set synchronously in the same task as the flip, never
     inside the animation callback, so there is no window in which a fast double-tap slips
     through.
     - **Match**: after the 220ms flip completes, both cards enter the locked `matched`
       state (req. 6), `state.busy = false`, and — in 2 players — the current player's score
       increments and **the turn stays with them** (Decision 5).
     - **No match**: hold for **1100ms** measured from the end of the second card's flip
       (Decision 7), then flip both back and clear `state.busy`. In 2 players the turn
       passes to the other player at the moment the cards flip back, not before, so the
       header does not change identity while the player is still reading the faces.
   - **Tap-to-hurry**: a tap *anywhere* (board, card, or page) during the 1100ms hold
     cancels the remaining wait and resolves the mismatch immediately. That tap is
     **consumed** — it never also flips a card. This gives an impatient 8-year-old a fast
     path without letting a stray tap queue a flip. Implemented as a one-shot capture-phase
     `pointerdown` listener installed only for the duration of the hold.
   - The pending timeout id is stored on `state` and cleared on: hurry, round end, view
     change, and `pagehide` — a timer must never fire into a torn-down view.
   - Card elements are real `<button>`s, so tap and keyboard are the same code path; no
     synthetic click handling, no pointer-capture (this game has no drag).

6. **Card states and visuals**:
   - **Face-down** (every card, every type, identical): `--color-surface-alt` with a subtle
     `repeating-linear-gradient` diagonal pattern and a `--color-border` edge. It must leak
     nothing — the back is the same whether the round is emoji or colors.
   - **Face-up**: the face (emoji glyph or SVG shape) on `--color-surface`.
   - **Matched**: stays in its cell, stays face-up, `disabled` + `aria-disabled="true"`,
     dimmed to ~70% opacity with a thicker border so it reads as "done" without vanishing.
     In 2 players it additionally carries the matching player's badge (req. 7).
   - **Focus**: the shared visible focus ring, never suppressed.

7. **Two players** — the only mode with a score, because the mode is inherently a contest:
   - **Turn indicator** in the play header, updated on every turn change:
     "התור של 🔵 1" / "התור של 🟢 2", and the header gets the active player's accent as a
     border/background tint.
   - **Live score chips**, both always visible: "🔵 1 — {pairs} זוגות".
   - **Colors**: player 1 = blue, player 2 = green, reusing existing theme tokens rather
     than inventing shades — `--mm-player-1: var(--color-primary)` (`#2b5fd9`) and
     `--mm-player-2: var(--color-success)` (`#23803a`). Both are documented in `theme.css`
     as holding ≥4.5:1 against white, so `--color-on-primary` / `--color-on-success` text
     on them is AA in both light and dark schemes.
   - **Never color alone** (AGENTS.md a11y): every player reference carries the **numeral**
     1/2 and a colored-circle emoji (🔵/🟢) next to the color. The matched-card badge is a
     numeral in a corner chip, and the two players' matched borders also differ in
     **style** (player 1 solid, player 2 dashed), so the board is readable in greyscale.
   - **End state**: higher pair count wins → "הכי הרבה זוגות: 🟢 2 עם {pairs} זוגות".
     **Tie** → "תיקו — {pairs} זוגות לכל אחד", both chips highlighted, confetti still fires.
     No "loser" wording anywhere; the losing score is shown as a plain chip, never framed
     as a failure.

8. **Animation — CSS only, no library** (consistent with the no-build-step rule):
   - **Flip**: each card is a `.mm-card` (the button, `perspective: 600px`) containing a
     `.mm-card__inner` with `transform-style: preserve-3d` and a
     `transform: rotateY(.5turn)` toggled by a `data-face="up|down"` attribute, 220ms
     `ease-out`. Front and back faces are absolutely positioned siblings with
     `backface-visibility: hidden`. 220ms is fast enough to feel responsive on 256 cards
     and slow enough for a young child to perceive as "turning over".
   - **Glyph reveal**: the face content animates `opacity 0→1` and `scale .6→1` over 150ms,
     delayed 110ms so it lands as the card passes edge-on — the glyph appears to be *on*
     the card, not fading through it.
   - **Match**: a single 300ms "pop" (`scale 1 → 1.08 → 1`) on both cards, then they settle
     into the matched state. No removal, no fly-away — the cards must not move (req. 3).
   - **RTL**: `rotateY` is a 3-D transform about the card's own axis and is unaffected by
     `dir`; it needs no direction special-casing and none should be added. **No
     `translateX`/`left`/`right` anywhere** — all card and chrome layout uses logical
     properties (`padding-inline`, `inset-inline-start`, `margin-inline-end`,
     `text-align: start`).
   - **`prefers-reduced-motion: reduce`**: the flip becomes an instant face swap with a
     90ms cross-fade (no rotation, no perspective), the glyph reveal and match pop become
     static state changes, and **confetti is not launched at all** — the end screen still
     shows its title, body and buttons. Motion is decoration here; nothing about the game's
     state depends on an animation having run.

9. **Storage** — via the shared **`scoped("memory-match")`** helper only, scope = the game
   id, matching its manifest entry. Deliberately minimal (Decision 9):
   - `lg:memory-match:last-setup` → `{ size: "small"|"medium"|"huge", type: string, players: 1|2 }`
     — the last setup, used to pre-select the setup cards. Written when a round starts.
   - **Validated on read**: `size` must be a known size id, `type` must exist in the type
     registry (so removing or renaming a type never breaks an old saved value), `players`
     must be exactly 1 or 2. Any field failing validation falls back to its default
     individually; a non-object, `null`, or unparseable value falls back to the whole
     default. Stored data is untrusted and user-editable — it must degrade, never throw.
   - **Not persisted**: the deck, revealed cards, scores, or mid-round state. A reload
     starts a fresh round, matching `fast-calc` and `numbers-maze`.
   - **No records, no best times, no leaderboard, no move counter** — nothing competitive
     or judgmental is stored or shown for the solo mode.

10. **Accessibility**:
    - The board is `role="grid"` with `aria-rowcount`/`aria-colcount`; rows are
      `role="row"`; each card is a `<button role="gridcell">` with `aria-rowindex` /
      `aria-colindex`.
    - **Roving tabindex** — exactly one card is tabbable at a time. Tabbing through 256
      buttons is unusable; arrow keys move focus within the grid, Home/End jump to the
      row's first/last card, and Enter/Space run the same `flipCard()`. Arrow keys follow
      **visual** direction: under `dir="rtl"` `ArrowRight` moves to the **previous** column
      index and `ArrowLeft` to the next; `ArrowUp`/`ArrowDown` are unaffected. Focus moving
      onto an off-screen card scrolls it into view (`block: "nearest"`).
    - **Labels**: face-down → "קלף סגור"; face-up → "קלף {name}"; matched → "זוג של {name}".
      For `colors`, `{name}` is composed from the shape, hue, and fill strings
      (e.g. "כוכב כחול מלא") — see req. 11.
    - An `aria-live="polite"` status announces reveals ("נחשף {name}"), results
      ("זוג!" / "לא זוג"), turn changes ("התור של 🔵 1"), and the win.
    - Every state distinction is carried by more than color: face-down vs face-up by the
      pattern and content, matched by opacity + border weight + (2P) a numeral badge,
      selection in setup by a ✓.

11. **i18n strings** (`memoryMatch.*`, added to **both** the `he` and `en` tables). Hebrew
    copy is **gender-neutral**, **spelled out** (no abbreviations), and paired with an icon
    where it helps:

    - Chrome: `title` ("משחק הזיכרון"), `setup.size`, `setup.size.small|medium|huge`,
      `setup.size.pairs` ("{pairs} זוגות"), `setup.size.hugeHint`, `setup.type`,
      `setup.type.emoji` ("ציורים"), `setup.type.colors` ("צבעים וצורות"),
      `setup.players`, `setup.players.one` ("שחקן אחד"), `setup.players.two` ("שני שחקנים"),
      `setup.start` ("התחלה").
    - Play: `play.progress` ("מצאת {found} מתוך {total} זוגות"),
      `play.turn` ("התור של {player}"), `play.score` ("{player} — {pairs} זוגות"),
      `play.peek` ("הקלפים שנחשפו"), `play.player1` ("🔵 1"), `play.player2` ("🟢 2").
    - Cards: `card.hidden` ("קלף סגור"), `card.face` ("קלף {name}"),
      `card.matched` ("זוג של {name}").
    - Color-face name parts: `face.color` ("{shape} {hue} {fill}"),
      `shape.circle|square|triangle|diamond|star|heart|plus|moon`,
      `hue.red|orange|yellow|green|teal|blue|purple|pink`,
      `fill.solid` ("מלא") / `fill.outline` ("בקו").
    - Live region: `a11y.revealed` ("נחשף {name}"), `a11y.match` ("זוג!"),
      `a11y.noMatch` ("לא זוג"), `a11y.turn` ("התור של {player}").
    - End: `win.title` ("כל הכבוד!"), `win.solo` ("מצאת את כל {pairs} הזוגות!"),
      `win.best` ("הכי הרבה זוגות: {player} עם {pairs} זוגות"),
      `win.tie` ("תיקו — {pairs} זוגות לכל אחד"),
      `win.playAgain` ("עוד פעם"), `win.changeSetup` ("לשנות את המשחק").

    Phrasing notes: use the unisex second-person singular ("מצאת") exactly as
    `numbers-maze` does, and **nominal sentences** for anything about a player
    ("הכי הרבה זוגות: 🟢 2 …") rather than a conjugated verb, which cannot be made unisex
    in Hebrew. Players are referred to by **numeral + colored circle**, never by a gendered
    noun. Instructions are infinitives ("להפוך שני קלפים ולמצוא זוג").

12. **Manifest entry** — the implementer adds exactly this to `app/games/manifest.js`;
    `GENRES` needs no change because `"זיכרון"` already exists:

    ```js
    {
      id: "memory-match",
      title: "משחק הזיכרון",
      genre: "זיכרון",
      minAge: 3,
      maxAge: 8,
      icon: "🃏",
      path: "games/memory-match/index.html",
      locked: false,
    },
    ```

    No portal code changes: the portal's age filter is **overlap-based** (AGENTS.md, fixed
    in commit `b794587`), so a 3–8 game shows under both the 3–5 and the 5–9 bands, which
    is exactly the intent (Decision 1).

13. Follows platform conventions (constitution / AGENTS.md): static and client-side only,
    vanilla ES modules with no build step, relative subpath-safe paths, shared CSS tokens,
    all text through the shared i18n layer, all persistence through `storage.js`, confetti
    reused from `shared/js/confetti.js` rather than reimplemented, no new shared module and
    therefore **no `service-worker.js` change**.

## Decisions (resolved before implementation)

1. **One age range, 3–8.** The two informal bands the human described (3–5 and 6–8) are
   reconciled into a single `minAge: 3` / `maxAge: 8` manifest entry, because the manifest
   shape allows exactly one range per game id and per-variant entries are not permitted.
   This is correct rather than merely convenient: the *same* game serves both bands via the
   board-size parameter (4×4 for a 3-year-old, 16×16 for an 8-year-old), and the portal's
   overlap-based age filter surfaces a 3–8 game under both the 3–5 and 5–9 bands. No new
   portal band and no portal code change are needed.

2. **Every type supplies ≥128 faces; no type × size combination is restricted.** Of the
   three resolutions considered, disabling e.g. "colors + 16×16" was rejected: a greyed-out
   option is confusing for a 5-year-old, and a setup screen whose options depend on each
   other is a rule the youngest players cannot learn. Instead, `emoji` ships a curated pool
   of exactly 128 kid-familiar glyphs (8 families × 16), and `colors` **generates** exactly
   128 faces as 8 hues × 8 shapes × 2 fills (req. 4). The composite approach is what makes
   `colors` viable at all — ~128 flat colors would be indistinguishable pastel steps for
   this audience, whereas hue + silhouette + solid/outline stays legible at a 44px cell and
   survives color-vision deficiency, since the shape carries the difference when the hue
   does not. Both pools are exactly 128 with no headroom needed, since 128 is the maximum
   any board requires.

3. **Emoji face names live in `cards.js` as content data, not in `i18n.js`.** Each emoji
   entry carries `name: { he, en }`, looked up by the current language code. Adding 128
   keys per language to the shared `i18n.js` table would roughly double that file for
   strings that are **content**, not UI chrome, and that grow with the asset list. The i18n
   layer still owns everything a reader actually sees as a sentence — the frames
   `card.face` / `card.matched` / `a11y.revealed` — and still owns language selection; only
   the noun slot comes from the content table. Nothing is hardcoded in markup. `colors`
   faces need no such table: their names compose from 8 + 8 + 2 = 18 ordinary i18n keys.

4. **16×16 on a phone scrolls, at full 44px cells — an accepted, documented exception.**
   A 16-column board cannot meet the 44px touch floor on any phone (360px ÷ 16 ≈ 22px), so
   one of the two constraints has to give. Shrinking the cells is rejected: sub-25px targets
   are unusable for a 3-to-8-year-old, and the glyph would stop reading as a picture.
   Scrolling is acceptable here — unlike in `numbers-maze` — precisely because this game's
   input is a **discrete tap**, which does not fight a pan gesture the way that game's
   continuous drag would. So the board container scrolls in both axes at 44px cells, the
   page never scrolls horizontally, `touch-action` is left at its default, the ענק setup
   card carries an honest hint that it wants a big screen, and a **pair-peek strip**
   (req. 3) compensates for the two revealed cards not fitting on screen together. On a
   desktop or large tablet 16×16 fits without scrolling anyway (734px at the floor).

5. **A match keeps the turn; a miss passes it.** The standard concentration house rule,
   stated explicitly because the human did not spell it out. It is also the right choice
   for this audience: a child who just succeeded gets to act immediately on what they just
   learned about the board, which is the whole pedagogical point of the game.

6. **Input is locked from the instant the second card is flipped**, synchronously, before
   any timer is scheduled — not from inside an animation or timer callback. A third card
   flipped mid-resolution is the canonical bug in this genre and the lock is the entire
   defense. The same guard also blocks re-tapping the first card ("matching a card with
   itself") and tapping an already-matched card.

7. **Mismatch hold = 1100ms**, measured from the end of the second card's 220ms flip.
   Below ~800ms a young child has not finished looking at the second glyph before it
   vanishes, which makes the game feel unfair rather than hard; above ~1400ms the pause
   drags, and on a 128-pair board it would dominate the session. 1100ms sits in the middle
   and is the single tunable constant in `game.js` (`MISMATCH_HOLD_MS`). The
   **tap-to-hurry** escape (req. 5) serves older players without shortening the default for
   younger ones.

8. **Matched cards stay on the board**, locked and dimmed, rather than being removed. The
   game is built on remembering *where* things are; removing cells would reflow the grid,
   invalidate that memory mid-round, and shift cards out from under a finger.

9. **Storage is one key: `last-setup`.** No records, no fastest time, no move counter, no
   leaderboard — matching `numbers-maze`'s deliberate restraint for young players. The only
   scores that exist are the 2-player pair counts, which live in memory for the duration of
   the round and are never persisted or compared across rounds.

10. **Confetti is reused, not re-created.** `app/shared/js/confetti.js` already exists (it
    was extracted from `fast-calc` for `numbers-maze`) and is imported as-is. No shared
    module is added or changed, so `PRECACHE_URLS` in `service-worker.js` is untouched —
    per-game files are not precached.

11. **Player colors reuse existing theme tokens** (`--color-primary` blue,
    `--color-success` green) aliased as `--mm-player-1` / `--mm-player-2`, rather than new
    shades. Both already carry documented ≥4.5:1 contrast with their `on-*` text in light
    and dark schemes, and every player reference pairs the color with a numeral and a
    colored-circle emoji so the mode never depends on color perception.

12. **Scope note.** Five files (three new, two one-entry additive edits), within the 1–5
    rule of thumb, with no shared-module or service-worker change. Full SDD is not
    warranted.

## Plan

1. `cards.js`: `SIZES` table (`small`/`medium`/`huge` → cols/rows/pairs), the 128-glyph
   `EMOJI_FACES` list with `he`/`en` names, `SHAPE_PATHS` + `HUES` + the 128-face `colors`
   generator, the `CARD_TYPES` registry, the family round-robin sampler, and
   `buildDeck(sizeId, typeId)`.
2. `index.html`: three views (setup / play / end) toggled by JS, shared header/back,
   shared CSS + module imports by relative path.
3. `game.js`: setup renderer driven by `SIZES` + `CARD_TYPES` (+ `last-setup` pre-select),
   board renderer, `flipCard()` state machine with the busy lock and the mismatch hold,
   2-player turn/score model, roving-tabindex keyboard grid, live region, pair-peek strip
   with its `ResizeObserver`, end flow with confetti, storage read/write.
4. `game.css`: setup option cards, the `--mm-cell` grid formula, Tier A / Tier B board
   container, card back pattern, 3D flip + glyph reveal + match pop, player color tokens
   and badges, focus rings, `prefers-reduced-motion` fallbacks — logical properties only.
5. Manifest entry + `memoryMatch.*` strings in both language tables.
6. Wire flip/match/miss/celebrate sounds via `audio.js` (graceful if files are absent).

## Tasks

- [ ] `cards.js` — sizes table, 128 emoji faces with he/en names, 128 generated color
      faces, type registry, family round-robin sampler, `buildDeck()`
- [ ] Verify deck generation: for all 3 sizes × 2 types, 100 decks each yield exactly
      `cols*rows` cards, every `faceKey` appearing exactly twice, and no duplicate faces
      within a deck
- [ ] Manifest entry + `memoryMatch.*` strings (`he` + `en`), including the 18
      shape/hue/fill parts
- [ ] `index.html` (setup / play / end views, shared imports)
- [ ] Setup screen: three option groups from the registries, `last-setup` pre-select,
      `aria-pressed` + ✓ selection, ענק hint line
- [ ] Board render: `--mm-cols`/`--mm-gap`, `role="grid"` rows/gridcells, card back +
      face markup for both `kind`s
- [ ] `flipCard()` state machine: busy lock set synchronously, same-card guard, matched
      guard, 1100ms mismatch hold, tap-to-hurry, timer cleanup on teardown
- [ ] 2-player mode: turn indicator, live score chips, match-keeps-turn, matched-card
      numeral badges + border-style difference, tie handling
- [ ] Roving tabindex + arrow-key grid navigation with RTL-correct horizontal mapping,
      `scrollIntoView` on focus, `aria-live` announcements
- [ ] Pair-peek strip, shown only when the board container actually overflows
- [ ] End screen: confetti (skipped under reduced motion), solo/winner/tie copy,
      עוד פעם / לשנות את המשחק
- [ ] Storage: `last-setup` written on round start, each field validated on read
- [ ] Style: 3D flip, glyph reveal, match pop, card-back pattern, Tier A/Tier B sizing,
      player tokens, reduced-motion fallbacks — logical properties throughout
- [ ] Manual test on a real phone: 4×4 fits with no scrolling; 16×16 pans smoothly with
      44px cells and the page never scrolls sideways; a third card cannot be flipped during
      the hold; rotation preserves the board and the scores
- [ ] `npm run lint`, `format:check`, `validate:html`, `check:links` all pass

## Done When

- [ ] All tasks checked off
- [ ] All six size × type combinations play to completion, including 16×16 with both types
      (128 distinct pairs each, no repeated face within a deck)
- [ ] A third card can never be flipped while a pair is resolving, and a card can never be
      matched with itself
- [ ] Mismatched cards flip back after 1100ms, or immediately on a tap that is consumed
      rather than flipping a new card
- [ ] 2 players: the turn indicator and both score chips are always correct, a match keeps
      the turn, a miss passes it, and the end screen names the winner or the tie without
      framing anyone as a loser
- [ ] Every cell is ≥44px on a 360×640 phone for every board size, with 16×16 panning
      inside its container and the page never scrolling horizontally
- [ ] Keyboard-only play works end to end via arrow keys + Enter, with RTL-correct
      horizontal movement, and the live region announces reveals, results and turn changes
- [ ] `prefers-reduced-motion` removes the rotation, the reveal animation, the match pop
      and the confetti, with the game fully playable
- [ ] `last-setup` persists across reload; corrupt or stale values degrade safely per field
- [ ] The game appears on the portal under זיכרון and under both the 3–5 and 5–9 age bands,
      with no portal code changes
- [ ] All four project checks pass with no errors
