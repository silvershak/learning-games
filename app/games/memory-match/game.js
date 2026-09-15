/**
 * game.js — view switching, board rendering, the flip state machine, the
 * 2-player turn/score model, keyboard grid navigation, the end flow, and
 * storage for the memory-match pairs game.
 *
 * Flow: setup screen (pick board size / card type / player count) -> play
 * (flip cards, resolve matches/mismatches, track turns+scores) -> end
 * (confetti, solo/winner/tie copy, play-again / change-setup). The deck and
 * all mid-round state live only in memory (a reload always starts a fresh
 * round); only the last-used setup is persisted, via storage.js under the
 * game's own scope.
 */

import { applyDir, getLang, t } from "../../shared/js/i18n.js";
import { renderHeader } from "../../shared/js/nav.js";
import * as storage from "../../shared/js/storage.js";
import { preload, play as playSound } from "../../shared/js/audio.js";
import { launchConfetti } from "../../shared/js/confetti.js";
import {
  SIZES,
  CARD_TYPES,
  HUES,
  SHAPE_PATHS,
  getSize,
  buildFaceIndex,
  buildDeck,
} from "./cards.js";

/** Storage scope for this game (see storage.js's `scoped()`). */
const STORAGE_SCOPE = "memory-match";
const store = storage.scoped(STORAGE_SCOPE);

/** Card flip duration — must match game.css's `.mm-card__inner` transition. */
const FLIP_MS = 220;

/**
 * Mismatch hold, measured from the end of the second card's flip (spec
 * Decision 7) — the single tunable constant of this file.
 */
const MISMATCH_HOLD_MS = 1100;

/** How long a matched pair's "pop" animation runs — must match game.css. */
const MATCH_POP_MS = 300;

const SVG_NS = "http://www.w3.org/2000/svg";

preload("flip", "../../assets/sounds/flip.mp3");
preload("match", "../../assets/sounds/match.mp3");
preload("miss", "../../assets/sounds/miss.mp3");
preload("celebrate", "../../assets/sounds/celebrate.mp3");

/**
 * All round state. Only `view` matters outside a round; everything else is
 * reset by startRound(). Never persisted — see storage section below.
 */
const state = {
  view: "setup", // "setup" | "play" | "end"
  size: null,
  typeId: null,
  players: 1,
  cols: 0,
  rows: 0,
  cards: [],
  faceByKey: new Map(),
  matched: new Set(),
  matchedBy: new Map(),
  firstIndex: null,
  secondIndex: null,
  busy: false,
  pendingTimeoutId: null,
  currentPlayer: 1,
  scores: { 1: 0, 2: 0 },
  matchedCount: 0,
  /** Solo-mode attempt counter — one per second-card flip. Powers the best-moves record. */
  moves: 0,
  /** Set by handleWin() for a solo round, read by renderEnd(); null otherwise. */
  recordResult: null,
};

/** DOM refs for the current play view, set by renderPlay(). */
let playRefs = null;

/** Card button elements for the current board, indexed by cell index. */
let cellButtons = [];

/** Whether the one-shot hurry pointerdown listener is currently installed. */
let hurryListenerActive = false;

/** Timer that disarms the click swallower if no click ever arrives. */
let clickSwallowTimeoutId = null;

const appEl = document.getElementById("app");

/* ---------------------------------------------------------------------- */
/* Storage                                                                 */
/* ---------------------------------------------------------------------- */

/** The gentlest combination — correct for the youngest end of the age range. */
const DEFAULT_SETUP = { size: "small", type: "emoji", players: 1 };

/**
 * Reads the last-used setup, validating each field independently: an
 * unknown size/type/players falls back to that field's default alone; a
 * non-object, null, or unparseable value falls back to the whole default.
 * Stored data is untrusted and user-editable — this must never throw.
 * @returns {{size: string, type: string, players: 1|2}}
 */
function loadLastSetup() {
  const raw = store.get("last-setup", null);
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_SETUP };
  }
  const size = SIZES.some((entry) => entry.id === raw.size) ? raw.size : DEFAULT_SETUP.size;
  const type = CARD_TYPES.some((entry) => entry.id === raw.type) ? raw.type : DEFAULT_SETUP.type;
  const players = raw.players === 1 || raw.players === 2 ? raw.players : DEFAULT_SETUP.players;
  return { size, type, players };
}

/**
 * Persists the setup a round was just started with.
 * @param {{size: string, type: string, players: 1|2}} setup
 * @returns {void}
 */
function saveLastSetup(setup) {
  store.set("last-setup", setup);
}

/**
 * Builds the storage key for a solo best-moves record: one per size x type
 * combination, mirroring fast-calc's per-config best-time records.
 * @param {string} sizeId
 * @param {string} typeId
 * @returns {string}
 */
function recordKey(sizeId, typeId) {
  return `best-moves-${sizeId}-${typeId}`;
}

/**
 * Reads the best (fewest) recorded moves for a size x type combination, or
 * null if none exists yet. Stored data is untrusted — a corrupt value
 * degrades to "no record" rather than throwing or comparing against garbage.
 * @param {string} sizeId
 * @param {string} typeId
 * @returns {number | null}
 */
function loadBestMoves(sizeId, typeId) {
  const raw = store.get(recordKey(sizeId, typeId), null);
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

/**
 * Persists a new best-moves record for a size x type combination.
 * @param {string} sizeId
 * @param {string} typeId
 * @param {number} moves
 * @returns {void}
 */
function saveBestMoves(sizeId, typeId, moves) {
  store.set(recordKey(sizeId, typeId), moves);
}

/**
 * Builds the storage key for a size x type combination's play count.
 * @param {string} sizeId
 * @param {string} typeId
 * @returns {string}
 */
function playCountKey(sizeId, typeId) {
  return `play-count-${sizeId}-${typeId}`;
}

/**
 * Reads how many times a size x type combination has been played to
 * completion (any player count). Stored data is untrusted — a corrupt value
 * degrades to 0 rather than throwing.
 * @param {string} sizeId
 * @param {string} typeId
 * @returns {number}
 */
function loadPlayCount(sizeId, typeId) {
  const raw = store.get(playCountKey(sizeId, typeId), 0);
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Increments a size x type combination's play count by one, on every
 * completed round (solo or 2-player).
 * @param {string} sizeId
 * @param {string} typeId
 * @returns {void}
 */
function incrementPlayCount(sizeId, typeId) {
  store.set(playCountKey(sizeId, typeId), loadPlayCount(sizeId, typeId) + 1);
}

/* ---------------------------------------------------------------------- */
/* Face rendering — branches only on `kind`, never on the type id (req. 4) */
/* ---------------------------------------------------------------------- */

/**
 * Renders a face's content as a DOM node, purely from `face.kind`. A future
 * type that reuses `kind: "shape"` needs zero changes here.
 * @param {import("./cards.js").Face} face
 * @returns {Element}
 */
function renderFaceContent(face) {
  if (face.kind === "emoji") {
    const span = document.createElement("span");
    span.className = "mm-card__glyph";
    span.setAttribute("aria-hidden", "true");
    span.textContent = face.glyph;
    return span;
  }
  if (face.kind === "shape") {
    return renderShapeSvg(face);
  }
  // Unknown kind — degrade to an empty, harmless node rather than throwing.
  return document.createElement("span");
}

/**
 * Renders a `kind: "shape"` face as an inline SVG from SHAPE_PATHS, solid or
 * outline per `face.fill`. aria-hidden — the accessible name is the composed
 * label from faceLabel(), never the SVG itself.
 * @param {import("./cards.js").Face} face
 * @returns {SVGElement}
 */
function renderShapeSvg(face) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add(
    "mm-card__shape",
    face.fill === "solid" ? "mm-card__shape--solid" : "mm-card__shape--outline"
  );

  const hue = HUES.find((entry) => entry.id === face.hue);
  svg.style.setProperty("--mm-hue", hue ? hue.hex : "currentColor");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", SHAPE_PATHS[face.shape] ?? "");
  svg.append(path);

  return svg;
}

/**
 * Composes a face's accessible/announced name. Emoji faces carry their own
 * `name: {he, en}` content table (spec Decision 3); `colors` faces compose
 * from the 18 shape/hue/fill i18n keys instead.
 * @param {import("./cards.js").Face} face
 * @returns {string}
 */
function faceLabel(face) {
  if (face.kind === "emoji") {
    const lang = getLang();
    return face.name[lang] ?? face.name.he;
  }
  return t("memoryMatch.face.color", {
    shape: t(`memoryMatch.shape.${face.shape}`),
    hue: t(`memoryMatch.hue.${face.hue}`),
    fill: t(`memoryMatch.fill.${face.fill}`),
  });
}

/* ---------------------------------------------------------------------- */
/* View plumbing                                                          */
/* ---------------------------------------------------------------------- */

/**
 * Replaces the page's view container with a single root element. Centralizes
 * the "view change" cleanup the pending-timeout contract requires (spec req. 5).
 * @param {HTMLElement} viewEl
 * @returns {void}
 */
function setView(viewEl) {
  clearPendingTimeout();
  appEl.replaceChildren(viewEl);
}

/* ---------------------------------------------------------------------- */
/* Setup screen                                                           */
/* ---------------------------------------------------------------------- */

/**
 * Builds a small decorative grid-density preview for a size option (aria-hidden;
 * the accessible name comes from the button's text content, not this preview).
 * @param {{cols: number, rows: number}} size
 * @returns {HTMLElement}
 */
function buildSizePreview(size) {
  const preview = document.createElement("span");
  preview.className = "mm-option__preview";
  preview.setAttribute("aria-hidden", "true");
  preview.style.setProperty("--mm-preview-cols", String(size.cols));
  const total = size.cols * size.rows;
  for (let i = 0; i < total; i += 1) {
    const dot = document.createElement("span");
    dot.className = "mm-option__dot";
    preview.append(dot);
  }
  return preview;
}

/**
 * Builds one setup option-card group (size / players): a labeled row of big
 * tappable buttons, `aria-pressed` reflecting the current selection.
 * @param {Object} config
 * @param {string} config.labelKey
 * @param {Array} config.options
 * @param {(option: *) => boolean} config.isSelected
 * @param {(option: *) => void} config.onSelect
 * @param {(option: *) => HTMLElement} config.buildContent - Appends the option's visible content to a button.
 * @returns {HTMLElement}
 */
function buildOptionGroup({ labelKey, options, isSelected, onSelect, buildContent }) {
  const group = document.createElement("div");
  group.className = "mm-group";

  const label = document.createElement("p");
  label.className = "mm-group__label";
  label.textContent = t(labelKey);
  group.append(label);

  const row = document.createElement("div");
  row.className = "mm-group__options";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", t(labelKey));

  const buttons = [];
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mm-option";
    button.setAttribute("aria-pressed", String(isSelected(option)));
    buildContent(option, button);
    button.addEventListener("click", () => {
      onSelect(option);
      for (const [otherOption, otherButton] of buttons) {
        otherButton.setAttribute("aria-pressed", String(isSelected(otherOption)));
      }
    });
    buttons.push([option, button]);
    row.append(button);
  }

  group.append(row);
  return group;
}

/**
 * Renders the setup screen: three option groups (size / type / players)
 * pre-selected from `last-setup`, plus the primary start button. One screen,
 * no wizard.
 * @returns {void}
 */
function renderSetup() {
  state.view = "setup";

  const setup = loadLastSetup();

  const container = document.createElement("div");
  container.className = "mm-setup";

  const heading = document.createElement("h2");
  heading.className = "mm-heading";
  heading.textContent = t("memoryMatch.title");
  container.append(heading);

  const recordEl = document.createElement("p");
  recordEl.className = "mm-setup__record";

  const playCountEl = document.createElement("p");
  playCountEl.className = "mm-setup__record";

  /** Refreshes the best-moves and play-count lines for the current size + type. */
  function updateRecordDisplay() {
    const best = loadBestMoves(setup.size, setup.type);
    recordEl.textContent =
      best === null
        ? t("memoryMatch.setup.noRecord")
        : t("memoryMatch.setup.bestMoves", { moves: best });

    const count = loadPlayCount(setup.size, setup.type);
    // Hidden rather than emptied when 0 (unlike recordEl, which always has
    // text either way) — most first-time setups have no play count yet, and
    // the setup screen has to fit one viewport with no scrolling, so an
    // empty reserved line is a cost worth avoiding here.
    playCountEl.hidden = count === 0;
    playCountEl.textContent = count > 0 ? t("memoryMatch.setup.playCount", { count }) : "";
  }

  container.append(
    buildOptionGroup({
      labelKey: "memoryMatch.setup.size",
      options: SIZES,
      isSelected: (size) => size.id === setup.size,
      onSelect: (size) => {
        setup.size = size.id;
        updateRecordDisplay();
      },
      buildContent: (size, button) => {
        button.className += " mm-option--size";
        button.append(buildSizePreview(size));

        const name = document.createElement("span");
        name.className = "mm-option__name";
        name.textContent = t(`memoryMatch.setup.size.${size.id}`);
        button.append(name);
      },
    })
  );

  // A native <select>, not option cards: 10 card types as full icon+label
  // cards (wrapping or scrolling) was too tall / needed an extra gesture to
  // reach every option. A <select> is a single compact row, and on mobile
  // opens the OS's own touch-friendly picker sheet — this repo already
  // trusts native form controls where they're the better fit (see
  // `numbers-maze`'s use of real <button>s over custom widgets).
  const typeGroup = document.createElement("div");
  typeGroup.className = "mm-group";

  const typeLabel = document.createElement("label");
  typeLabel.className = "mm-group__label";
  typeLabel.setAttribute("for", "mm-type-select");
  typeLabel.textContent = t("memoryMatch.setup.type");
  typeGroup.append(typeLabel);

  const typeSelect = document.createElement("select");
  typeSelect.id = "mm-type-select";
  typeSelect.className = "mm-select";
  for (const type of CARD_TYPES) {
    const option = document.createElement("option");
    option.value = type.id;
    // Icon-only visible text, per the platform's "icon over text" principle —
    // the full name is still available as a hover tooltip for desktop mouse
    // users (a native <option>'s accessible name is always its text content,
    // so this does trade off some screen-reader precision for compactness).
    option.textContent = type.icon;
    option.title = t(type.labelKey);
    option.selected = type.id === setup.type;
    typeSelect.append(option);
  }
  typeSelect.addEventListener("change", () => {
    setup.type = typeSelect.value;
    updateRecordDisplay();
  });

  // Wrapped so the native dropdown arrow can be replaced with a custom one
  // positioned via a logical inset (RTL-safe): the OS's own arrow reserves
  // asymmetric space on one side of the box, which left the centered emoji
  // visibly off-center. appearance: none removes it; text-align/-last alone
  // then genuinely centers the icon in the whole control.
  const typeSelectWrap = document.createElement("div");
  typeSelectWrap.className = "mm-select-wrap";
  typeSelectWrap.append(typeSelect);
  typeGroup.append(typeSelectWrap);

  container.append(typeGroup);

  updateRecordDisplay();
  container.append(recordEl, playCountEl);

  const PLAYER_OPTIONS = [
    { value: 1, icon: "👤", labelKey: "memoryMatch.setup.players.one" },
    { value: 2, icon: "👥", labelKey: "memoryMatch.setup.players.two" },
  ];
  container.append(
    buildOptionGroup({
      labelKey: "memoryMatch.setup.players",
      options: PLAYER_OPTIONS,
      isSelected: (option) => option.value === setup.players,
      onSelect: (option) => {
        setup.players = option.value;
      },
      buildContent: (option, button) => {
        button.className += " mm-option--players";
        const icon = document.createElement("span");
        icon.className = "mm-option__icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = option.icon;
        button.append(icon);

        const name = document.createElement("span");
        name.className = "mm-option__name";
        name.textContent = t(option.labelKey);
        button.append(name);
      },
    })
  );

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "btn btn--success mm-setup__start";
  startButton.textContent = t("memoryMatch.setup.start");
  startButton.addEventListener("click", () => startRound(setup));
  container.append(startButton);

  setView(container);
}

/* ---------------------------------------------------------------------- */
/* Round start                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Starts a new round: builds a fresh deck, resets all mid-round state,
 * persists the setup, and switches to the play view.
 * @param {{size: string, type: string, players: 1|2}} setup
 * @returns {void}
 */
function startRound(setup) {
  saveLastSetup(setup);

  const size = getSize(setup.size);
  const deck = buildDeck(setup.size, setup.type);

  state.view = "play";
  state.size = size;
  state.typeId = setup.type;
  state.players = setup.players;
  state.cols = deck.cols;
  state.rows = deck.rows;
  state.cards = deck.cards;
  state.faceByKey = buildFaceIndex(setup.type);
  state.matched = new Set();
  state.matchedBy = new Map();
  state.firstIndex = null;
  state.secondIndex = null;
  state.busy = false;
  state.currentPlayer = 1;
  state.scores = { 1: 0, 2: 0 };
  state.matchedCount = 0;
  state.moves = 0;
  state.recordResult = null;

  renderPlay();
}

/* ---------------------------------------------------------------------- */
/* Play view                                                              */
/* ---------------------------------------------------------------------- */

/**
 * Renders the play view: HUD (solo: just the live moves counter; 2-player:
 * a side panel of player badges, req. 7's amendment), the live region, and
 * the board grid.
 * @returns {void}
 */
function renderPlay() {
  const container = document.createElement("div");
  container.className = "mm-play";

  const hud = document.createElement("div");
  hud.className = "mm-hud";

  let badge1 = null;
  let badge2 = null;

  if (state.players === 1) {
    // Solo mode intentionally has no HUD content above the board — no
    // progress line, no timer, no score (spec req. 9a's restraint extended
    // to this too, at the human's request).
  } else {
    container.classList.add("mm-play--sidebar");
    hud.classList.add("mm-hud--sidebar");

    badge1 = buildPlayerBadge(1);
    badge2 = buildPlayerBadge(2);
    const players = document.createElement("div");
    players.className = "mm-hud__players";
    players.append(badge1.el, badge2.el);
    hud.append(players);
  }

  const movesEl = document.createElement("p");
  movesEl.className = "mm-hud__moves";
  hud.append(movesEl);

  container.append(hud);

  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("aria-live", "polite");
  container.append(status);

  const boardContainer = document.createElement("div");
  boardContainer.className = "mm-board-container";

  const board = document.createElement("div");
  board.className = "mm-board";
  board.setAttribute("role", "grid");
  board.setAttribute("aria-rowcount", String(state.rows));
  board.setAttribute("aria-colcount", String(state.cols));
  board.setAttribute("aria-label", t("memoryMatch.title"));
  board.style.setProperty("--mm-cols", String(state.cols));
  // 2px, not the usual --space-2 (8px): reproduces the spec's own worked
  // example (16 x 44 + 15 x 2 = 734px) so 16x16 fits at the 44px floor on a
  // tablet/desktop without Tier B scrolling (req. 3 / Decision 4).
  board.style.setProperty("--mm-gap", "2px");

  boardContainer.append(board);
  container.append(boardContainer);

  playRefs = {
    container,
    hud,
    badge1El: badge1?.el ?? null,
    badge2El: badge2?.el ?? null,
    badge1Count: badge1?.count ?? null,
    badge2Count: badge2?.count ?? null,
    movesEl,
    status,
    boardContainer,
    board,
  };

  cellButtons = new Array(state.cards.length).fill(null);
  buildBoardCells(board);

  setView(container);

  updateMovesDisplay();
  if (state.players === 2) {
    updatePlayerBadges();
  }
}

/**
 * Builds the board's cell buttons, grouped into `role="row"` wrapper divs
 * (each `display: contents` so its children still participate directly in
 * the parent's CSS Grid layout) so the accessible row structure matches the
 * visual grid without an extra layout level.
 * @param {HTMLElement} board
 * @returns {void}
 */
function buildBoardCells(board) {
  for (let row = 0; row < state.rows; row += 1) {
    const rowEl = document.createElement("div");
    rowEl.className = "mm-board__row";
    rowEl.setAttribute("role", "row");
    rowEl.setAttribute("aria-rowindex", String(row + 1));

    for (let col = 0; col < state.cols; col += 1) {
      const index = row * state.cols + col;
      const card = state.cards[index];
      const face = state.faceByKey.get(card.faceKey);
      const button = buildCardButton(index, row, col, face);
      cellButtons[index] = button;
      rowEl.append(button);
    }
    board.append(rowEl);
  }
}

/**
 * Builds one card button. Front and back faces are both rendered upfront
 * (never rebuilt mid-round — matched cards must never reflow, req. 3) and
 * toggled purely via the `data-face` attribute + CSS 3D transform.
 * @param {number} index
 * @param {number} row
 * @param {number} col
 * @param {import("./cards.js").Face} face
 * @returns {HTMLButtonElement}
 */
function buildCardButton(index, row, col, face) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "mm-card";
  button.dataset.index = String(index);
  button.dataset.face = "down";
  button.setAttribute("role", "gridcell");
  button.setAttribute("aria-rowindex", String(row + 1));
  button.setAttribute("aria-colindex", String(col + 1));
  button.setAttribute("aria-label", t("memoryMatch.card.hidden"));
  button.tabIndex = index === 0 ? 0 : -1;

  const inner = document.createElement("span");
  inner.className = "mm-card__inner";

  const back = document.createElement("span");
  back.className = "mm-card__face mm-card__face--back";
  back.setAttribute("aria-hidden", "true");

  const front = document.createElement("span");
  front.className = "mm-card__face mm-card__face--front";
  front.setAttribute("aria-hidden", "true");
  front.append(renderFaceContent(face));

  inner.append(back, front);
  button.append(inner);

  button.addEventListener("click", () => flipCard(index));
  // Enter/Space on a focused <button> already dispatch a native click — no
  // synthetic activation handling needed (spec req. 5). This handler only
  // covers arrow-key/Home/End grid navigation.
  button.addEventListener("keydown", (event) => handleCardKeydown(event, index, row, col));

  return button;
}

/**
 * Arrow-key / Home / End roving-tabindex grid navigation. Arrow keys follow
 * *visual* direction: under dir="rtl", ArrowRight moves to the previous
 * column index and ArrowLeft to the next; ArrowUp/ArrowDown are unaffected.
 * @param {KeyboardEvent} event
 * @param {number} index
 * @param {number} row
 * @param {number} col
 * @returns {void}
 */
function handleCardKeydown(event, index, row, col) {
  const rtl = document.documentElement.dir === "rtl";

  switch (event.key) {
    case "ArrowRight":
      event.preventDefault();
      focusInDirection(row, col, 0, rtl ? -1 : 1);
      return;
    case "ArrowLeft":
      event.preventDefault();
      focusInDirection(row, col, 0, rtl ? 1 : -1);
      return;
    case "ArrowUp":
      event.preventDefault();
      focusInDirection(row, col, -1, 0);
      return;
    case "ArrowDown":
      event.preventDefault();
      focusInDirection(row, col, 1, 0);
      return;
    case "Home":
      event.preventDefault();
      focusRowEdge(row, "start");
      return;
    case "End":
      event.preventDefault();
      focusRowEdge(row, "end");
      return;
    default:
    // Not a navigation key — leave it to the button's native handling
    // (Enter/Space already dispatch a native 'click', see buildCardButton).
  }
}

/**
 * Moves focus one step from (row, col) in (rowStep, colStep), continuing
 * further in the same direction past any already-matched (disabled,
 * unfocusable) cards until an enabled cell is found or the grid edge is
 * reached.
 * @param {number} row
 * @param {number} col
 * @param {number} rowStep
 * @param {number} colStep
 * @returns {void}
 */
function focusInDirection(row, col, rowStep, colStep) {
  let r = row + rowStep;
  let c = col + colStep;
  while (r >= 0 && r < state.rows && c >= 0 && c < state.cols) {
    const index = r * state.cols + c;
    if (!state.matched.has(index)) {
      focusCard(index);
      return;
    }
    r += rowStep;
    c += colStep;
  }
}

/**
 * Focuses the row's first ("start", index 0) or last ("end", index cols-1)
 * card, searching inward from that edge if it's already matched. Home/End
 * are index-order, not RTL-aware (only ArrowLeft/ArrowRight are).
 * @param {number} row
 * @param {"start"|"end"} edge
 * @returns {void}
 */
function focusRowEdge(row, edge) {
  const colStep = edge === "start" ? 1 : -1;
  let col = edge === "start" ? 0 : state.cols - 1;
  while (col >= 0 && col < state.cols) {
    const index = row * state.cols + col;
    if (!state.matched.has(index)) {
      focusCard(index);
      return;
    }
    col += colStep;
  }
}

/**
 * Moves the single roving tabindex to `index` and focuses + scrolls it into
 * view. No-ops if the target button is missing or disabled.
 * @param {number} index
 * @returns {void}
 */
function focusCard(index) {
  const button = cellButtons[index];
  if (!button || button.disabled) {
    return;
  }
  for (const otherButton of cellButtons) {
    if (otherButton) {
      otherButton.tabIndex = -1;
    }
  }
  button.tabIndex = 0;
  button.focus();
  button.scrollIntoView({ block: "nearest" });
}

/**
 * Ensures exactly one enabled card carries tabindex 0 — needed after a match
 * disables the two just-matched cards, one of which might have been the
 * currently-tabbable card.
 * @returns {void}
 */
function ensureRovingTabIndex() {
  const hasTabbable = cellButtons.some(
    (button) => button && button.tabIndex === 0 && !button.disabled
  );
  if (hasTabbable) {
    return;
  }
  const next = cellButtons.find((button) => button && !button.disabled);
  if (next) {
    next.tabIndex = 0;
  }
}

/* ---------------------------------------------------------------------- */
/* The flip state machine (spec req. 5 / Decision 6)                      */
/* ---------------------------------------------------------------------- */

/**
 * The single entry point for every input path (pointer tap, Enter/Space on a
 * focused card — both arrive here as a 'click' on the card button). Returns
 * immediately, doing nothing, when busy, the card is already matched, the
 * card is already the currently-revealed first card, or no round is in
 * progress.
 * @param {number} index
 * @returns {void}
 */
function flipCard(index) {
  if (state.view !== "play" || state.busy) {
    return;
  }
  if (state.matched.has(index) || index === state.firstIndex) {
    return;
  }

  revealCard(index);

  if (state.firstIndex === null) {
    state.firstIndex = index;
    announce(
      t("memoryMatch.a11y.revealed", {
        name: faceLabel(state.faceByKey.get(state.cards[index].faceKey)),
      })
    );
    return;
  }

  state.secondIndex = index;
  // The lock is set synchronously, in the same task as the flip, before any
  // timer is scheduled — this is the entire defense against a third card
  // being flipped mid-resolution (spec Decision 6).
  state.busy = true;
  state.moves += 1;
  updateMovesDisplay();

  announce(
    t("memoryMatch.a11y.revealed", {
      name: faceLabel(state.faceByKey.get(state.cards[index].faceKey)),
    })
  );

  const isMatch = state.cards[state.firstIndex].faceKey === state.cards[state.secondIndex].faceKey;
  if (isMatch) {
    scheduleMatchResolution();
  } else {
    scheduleMismatchResolution();
  }
}

/**
 * Flips a card face-up in the DOM and updates its accessible label.
 * @param {number} index
 * @returns {void}
 */
function revealCard(index) {
  const button = cellButtons[index];
  button.dataset.face = "up";
  const face = state.faceByKey.get(state.cards[index].faceKey);
  button.setAttribute("aria-label", t("memoryMatch.card.face", { name: faceLabel(face) }));
  playSound("flip");
}

/**
 * Flips a card back face-down (mismatch resolution) and restores its
 * "hidden" accessible label.
 * @param {number} index
 * @returns {void}
 */
function hideCard(index) {
  const button = cellButtons[index];
  button.dataset.face = "down";
  button.setAttribute("aria-label", t("memoryMatch.card.hidden"));
}

/**
 * Schedules the match resolution at the end of the second card's 220ms flip.
 * @returns {void}
 */
function scheduleMatchResolution() {
  clearPendingTimeout();
  state.pendingTimeoutId = window.setTimeout(() => {
    state.pendingTimeoutId = null;
    resolveMatch();
  }, FLIP_MS);
}

/**
 * Resolves a match: both cards enter the locked matched state, busy clears,
 * and — in 2 players — the current player's score increments and the turn
 * stays with them (spec Decision 5).
 * @returns {void}
 */
function resolveMatch() {
  const { firstIndex, secondIndex } = state;
  state.matched.add(firstIndex);
  state.matched.add(secondIndex);
  markMatched(firstIndex);
  markMatched(secondIndex);
  state.matchedCount += 1;

  playSound("match");
  announce(t("memoryMatch.a11y.match"));

  if (state.players === 2) {
    state.scores[state.currentPlayer] += 1;
    updatePlayerBadges();
  }

  state.firstIndex = null;
  state.secondIndex = null;
  state.busy = false;
  ensureRovingTabIndex();

  if (state.matchedCount === state.size.pairs) {
    handleWin();
  }
}

/**
 * Marks a card as matched: locked, dimmed, disabled, and (in 2 players)
 * carrying the matching player's numeral badge and border style.
 * @param {number} index
 * @returns {void}
 */
function markMatched(index) {
  const button = cellButtons[index];
  const face = state.faceByKey.get(state.cards[index].faceKey);

  button.classList.add("mm-card--matched");
  button.disabled = true;
  button.setAttribute("aria-disabled", "true");
  button.tabIndex = -1;
  button.setAttribute("aria-label", t("memoryMatch.card.matched", { name: faceLabel(face) }));

  button.classList.add("mm-card--pop");
  window.setTimeout(() => button.classList.remove("mm-card--pop"), MATCH_POP_MS);

  if (state.players === 2) {
    const player = state.currentPlayer;
    state.matchedBy.set(index, player);
    button.classList.add(player === 1 ? "mm-card--p1" : "mm-card--p2");

    const badge = document.createElement("span");
    badge.className = "mm-card__badge";
    badge.setAttribute("aria-hidden", "true");
    badge.textContent = String(player);
    button.append(badge);
  }
}

/**
 * Schedules the mismatch flip-back: the hold (Decision 7) is measured from
 * the end of the second card's flip, so the first timer waits out the flip
 * itself, then installs the tap-to-hurry listener and starts the hold timer.
 * @returns {void}
 */
function scheduleMismatchResolution() {
  clearPendingTimeout();
  state.pendingTimeoutId = window.setTimeout(() => {
    state.pendingTimeoutId = null;
    installHurryListener();
    state.pendingTimeoutId = window.setTimeout(() => {
      state.pendingTimeoutId = null;
      resolveMismatch();
    }, MISMATCH_HOLD_MS);
  }, FLIP_MS);
}

/**
 * Resolves a mismatch: flips both cards back, clears busy, and — in 2
 * players — passes the turn at this moment (not before), so the header
 * doesn't change identity while the player is still reading the faces.
 * @returns {void}
 */
function resolveMismatch() {
  removeHurryListener();

  const { firstIndex, secondIndex } = state;
  hideCard(firstIndex);
  hideCard(secondIndex);

  playSound("miss");
  announce(t("memoryMatch.a11y.noMatch"));

  state.firstIndex = null;
  state.secondIndex = null;
  state.busy = false;

  if (state.players === 2) {
    switchTurn();
  }
}

/**
 * Clears whichever single timer is currently pending (matched/mismatch
 * resolution) and removes the hurry listener, if installed. Called on hurry,
 * round end, view change (via setView), and pagehide — a timer must never
 * fire into a torn-down view.
 * @returns {void}
 */
function clearPendingTimeout() {
  if (state.pendingTimeoutId !== null) {
    window.clearTimeout(state.pendingTimeoutId);
    state.pendingTimeoutId = null;
  }
  removeHurryListener();
  disarmClickSwallow();
}

/**
 * Resolves a pair whose resolution timer was cancelled by `pagehide` rather
 * than by the player. Without this, a back-forward-cache restore would
 * return to a board stuck with `busy = true` and two cards face-up forever,
 * since the timer that was going to clear the lock is gone.
 * @returns {void}
 */
function resolvePendingNow() {
  if (state.view !== "play" || !state.busy || state.firstIndex === null) {
    return;
  }
  if (state.secondIndex === null) {
    return;
  }
  const isMatch = state.cards[state.firstIndex].faceKey === state.cards[state.secondIndex].faceKey;
  if (isMatch) {
    resolveMatch();
  } else {
    resolveMismatch();
  }
}

/**
 * Installs the one-shot capture-phase pointerdown listener that lets a tap
 * anywhere hurry through the mismatch hold (spec req. 5).
 * @returns {void}
 */
function installHurryListener() {
  if (hurryListenerActive) {
    return;
  }
  hurryListenerActive = true;
  document.addEventListener("pointerdown", onHurryPointerDown, { capture: true });
}

/**
 * Removes the hurry listener, if installed. Idempotent.
 * @returns {void}
 */
function removeHurryListener() {
  if (!hurryListenerActive) {
    return;
  }
  hurryListenerActive = false;
  document.removeEventListener("pointerdown", onHurryPointerDown, { capture: true });
}

/**
 * The hurry listener itself: cancels the remaining hold and resolves the
 * mismatch immediately. Also arms a paired one-shot click-swallow listener —
 * browsers don't reliably suppress the 'click' that a tap/pointerdown
 * sequence produces just by calling preventDefault()/stopPropagation() on
 * the pointerdown alone, and that follow-up click must never also flip a
 * new card (the tap is "consumed").
 * @param {PointerEvent} event
 * @returns {void}
 */
function onHurryPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  clearPendingTimeout();
  armClickSwallow();
  resolveMismatch();
}

/**
 * How long the click swallower stays armed waiting for the click that a
 * hurry tap normally produces. A pointerdown that turns into a pan (or a
 * canceled pointer) never produces one, so the swallower must expire rather
 * than linger and eat the player's *next* intentional tap.
 */
const CLICK_SWALLOW_TTL_MS = 500;

/**
 * Arms a one-shot capture-phase click swallower, consuming the very next
 * click anywhere so the tap that triggered hurry-through can never also
 * flip a card.
 * @returns {void}
 */
function armClickSwallow() {
  disarmClickSwallow();
  document.addEventListener("click", onSwallowClick, { capture: true });
  clickSwallowTimeoutId = window.setTimeout(disarmClickSwallow, CLICK_SWALLOW_TTL_MS);
}

/**
 * Removes the click swallower and its expiry timer. Idempotent.
 * @returns {void}
 */
function disarmClickSwallow() {
  if (clickSwallowTimeoutId !== null) {
    window.clearTimeout(clickSwallowTimeoutId);
    clickSwallowTimeoutId = null;
  }
  document.removeEventListener("click", onSwallowClick, { capture: true });
}

/**
 * The paired click swallower: consumes exactly one click, then disarms.
 * @param {MouseEvent} event
 * @returns {void}
 */
function onSwallowClick(event) {
  event.preventDefault();
  event.stopPropagation();
  disarmClickSwallow();
}

/* ---------------------------------------------------------------------- */
/* HUD updates                                                            */
/* ---------------------------------------------------------------------- */

/**
 * Refreshes the live moves (attempts) counter — updated after every
 * second-card flip, in both 1 and 2 players.
 * @returns {void}
 */
function updateMovesDisplay() {
  if (playRefs?.movesEl) {
    const label = t("memoryMatch.play.moves", { moves: state.moves });
    // Icon-forward per the platform's "less text, more icons" principle — the
    // full sentence is kept as the accessible name via aria-label.
    playRefs.movesEl.textContent = `👆 ${state.moves}`;
    playRefs.movesEl.setAttribute("aria-label", label);
  }
}

/**
 * Returns the "numeral + colored circle" label for a player, used for
 * accessible names and announcements (never shown visually — the 2-player
 * badges identify a player by color + icon + position instead, per the
 * human's request to drop the visible numeral).
 * @param {1|2} player
 * @returns {string}
 */
function playerLabel(player) {
  return t(player === 1 ? "memoryMatch.play.player1" : "memoryMatch.play.player2");
}

/**
 * Builds one 2-player side-panel badge: a colored circle (player 1 blue,
 * player 2 green) holding a gender-neutral kid glyph and the player's pair
 * count — no numeral shown. The circle alone would be "color alone"
 * identification, so the accessible name (set by updatePlayerBadges) always
 * carries the numeral + pairs text even though nothing on screen does.
 * @param {1|2} player
 * @returns {{ el: HTMLElement, count: HTMLElement }}
 */
function buildPlayerBadge(player) {
  const el = document.createElement("div");
  el.className = `mm-player-badge mm-player-badge--p${player}`;
  el.setAttribute("role", "status");

  const icon = document.createElement("span");
  icon.className = "mm-player-badge__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🧒";
  el.append(icon);

  const count = document.createElement("span");
  count.className = "mm-player-badge__count";
  count.setAttribute("aria-hidden", "true");
  el.append(count);

  return { el, count };
}

/**
 * Refreshes both 2-player badges (pair count, and which one carries the
 * "active turn" highlight — a size/shadow change, not a color change, so
 * whose turn it is is never conveyed by color alone from the badges) and the
 * board's own border, tinted in the active player's color as a second,
 * bigger, harder-to-miss turn cue (the human asked for this — a colored ring
 * around the board itself, not just a small badge highlight). The border is
 * a reinforcing cue on top of the badge's shape-based one, not the sole
 * signal, so it doesn't reintroduce color-alone identification.
 * @returns {void}
 */
function updatePlayerBadges() {
  if (!playRefs?.badge1El || !playRefs?.badge2El) {
    return;
  }
  playRefs.badge1Count.textContent = String(state.scores[1]);
  playRefs.badge2Count.textContent = String(state.scores[2]);

  for (const [player, badge] of [
    [1, playRefs.badge1El],
    [2, playRefs.badge2El],
  ]) {
    const isActive = state.currentPlayer === player;
    badge.classList.toggle("mm-player-badge--active", isActive);
    badge.setAttribute(
      "aria-label",
      t("memoryMatch.play.score", { player: playerLabel(player), pairs: state.scores[player] })
    );
  }

  playRefs.boardContainer?.classList.toggle("mm-board-container--p1", state.currentPlayer === 1);
  playRefs.boardContainer?.classList.toggle("mm-board-container--p2", state.currentPlayer === 2);
}

/**
 * Passes the turn to the other player and announces the change.
 * @returns {void}
 */
function switchTurn() {
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  updatePlayerBadges();
  announce(t("memoryMatch.a11y.turn", { player: playerLabel(state.currentPlayer) }));
}

/**
 * Pushes text into the aria-live status region.
 * @param {string} text
 * @returns {void}
 */
function announce(text) {
  if (playRefs?.status) {
    playRefs.status.textContent = text;
  }
}

/* ---------------------------------------------------------------------- */
/* End flow                                                               */
/* ---------------------------------------------------------------------- */

/**
 * Detects the user's reduced-motion preference.
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Handles reaching the last pair: switches to the end view. No confetti
 * scheduling delay is needed — the win view itself gates confetti on the
 * reduced-motion preference.
 * @returns {void}
 */
function handleWin() {
  clearPendingTimeout();
  playSound("celebrate");

  const sizeId = state.size.id;
  const typeId = state.typeId;
  incrementPlayCount(sizeId, typeId);

  if (state.players === 1) {
    const previousBest = loadBestMoves(sizeId, typeId);
    const isNewRecord = previousBest === null || state.moves < previousBest;
    if (isNewRecord) {
      saveBestMoves(sizeId, typeId, state.moves);
    }
    state.recordResult = { moves: state.moves, previousBest, isNewRecord };
  }

  renderEnd();
}

/**
 * Renders the end view: solo completion / 2-player winner / tie copy (never
 * "loser" wording), confetti (skipped under reduced motion), and the two
 * next actions.
 * @returns {void}
 */
function renderEnd() {
  state.view = "end";

  const container = document.createElement("div");
  container.className = "mm-end";

  const heading = document.createElement("h2");
  heading.className = "mm-heading";
  heading.textContent = t("memoryMatch.win.title");
  container.append(heading);

  const body = document.createElement("p");
  body.className = "mm-end__body";

  if (state.players === 1) {
    body.textContent = t("memoryMatch.win.solo", { pairs: state.size.pairs });
  } else {
    const p1 = state.scores[1];
    const p2 = state.scores[2];
    if (p1 === p2) {
      body.textContent = t("memoryMatch.win.tie", { pairs: p1 });
    } else {
      const winner = p1 > p2 ? 1 : 2;
      body.textContent = t("memoryMatch.win.best", {
        player: playerLabel(winner),
        pairs: state.scores[winner],
      });
    }
  }
  container.append(body);

  if (state.players === 1 && state.recordResult) {
    const { moves, previousBest, isNewRecord } = state.recordResult;

    const movesEl = document.createElement("p");
    movesEl.className = "mm-end__body";
    movesEl.textContent = t("memoryMatch.win.moves", { moves });
    container.append(movesEl);

    const recordEl = document.createElement("p");
    recordEl.className = "mm-end__body";
    if (isNewRecord) {
      recordEl.textContent =
        previousBest === null
          ? t("memoryMatch.win.newRecord")
          : `${t("memoryMatch.win.newRecord")} ${t("memoryMatch.win.fewerMovesBy", { count: previousBest - moves })}`;
    } else {
      recordEl.textContent = t("memoryMatch.win.moreMovesBy", { count: moves - previousBest });
    }
    container.append(recordEl);
  }

  if (state.players === 2) {
    const isTie = state.scores[1] === state.scores[2];
    const winner = isTie ? null : state.scores[1] > state.scores[2] ? 1 : 2;

    // Same badge component as the in-play side panel (icon + count, no
    // numeral) — the winner (if any) carries the same highlight the active
    // player's turn used in play, repurposed here to mean "winner" instead.
    const scoresEl = document.createElement("div");
    scoresEl.className = "mm-end__scores";
    for (const player of [1, 2]) {
      const badge = buildPlayerBadge(player);
      badge.count.textContent = String(state.scores[player]);
      badge.el.setAttribute(
        "aria-label",
        t("memoryMatch.play.score", { player: playerLabel(player), pairs: state.scores[player] })
      );
      if (player === winner) {
        badge.el.classList.add("mm-player-badge--active");
      }
      scoresEl.append(badge.el);
    }
    container.append(scoresEl);
  }

  const actions = document.createElement("div");
  actions.className = "mm-end__actions";

  const lastSetup = { size: state.size.id, type: state.typeId, players: state.players };

  const againButton = document.createElement("button");
  againButton.type = "button";
  againButton.className = "btn btn--success";
  againButton.textContent = t("memoryMatch.win.playAgain");
  againButton.addEventListener("click", () => startRound(lastSetup));
  actions.append(againButton);

  const changeButton = document.createElement("button");
  changeButton.type = "button";
  changeButton.className = "btn btn--outline";
  changeButton.textContent = t("memoryMatch.win.changeSetup");
  changeButton.addEventListener("click", renderSetup);
  actions.append(changeButton);

  container.append(actions);
  setView(container);

  // Motion is decoration here — nothing about the game's state depends on
  // an animation having run, so under reduced motion confetti simply never
  // launches (spec req. 8's last bullet).
  if (!prefersReducedMotion()) {
    launchConfetti(container);
  }
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

/**
 * Boots the game: shared header + RTL setup, a pagehide guard for the
 * pending-timeout contract, then the setup screen.
 * @returns {void}
 */
function init() {
  applyDir();
  renderHeader(document.getElementById("page-header"), { title: t("memoryMatch.title") });
  window.addEventListener("pagehide", clearPendingTimeout);
  // A bfcache restore brings back the exact JS state pagehide left behind —
  // including a busy lock whose resolution timer pagehide just cleared.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      resolvePendingNow();
    }
  });
  renderSetup();
}

init();
