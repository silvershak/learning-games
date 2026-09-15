/**
 * game.js — round controller for the fast-calc timed arithmetic game.
 *
 * Flow: start screen (pick operation / max result / question count via
 * sliders) -> play (live timer + record HUD, timed questions, three answer
 * buttons, wrong-answer cooldown) -> finish (time, confetti, record
 * comparison). Round state (timer, used-keys, progress) lives only in
 * memory; only best-time records are persisted, via storage.js under the
 * game's own scope.
 */

import { applyDir, t } from "../../shared/js/i18n.js";
import { renderHeader, setBackHandler } from "../../shared/js/nav.js";
import * as storage from "../../shared/js/storage.js";
import { preload, play as playSound } from "../../shared/js/audio.js";
import { clamp, randomInt } from "../../shared/js/util.js";
import { launchConfetti } from "../../shared/js/confetti.js";
import { operations, getOperation } from "./operations.js";

/** Storage scope for this game's best-time records (see storage.js). */
const STORAGE_SCOPE = "fast-calc";

/** Difficulty choices offered on the start screen's max-result slider. */
export const MAX_RESULT_OPTIONS = [10, 20, 50, 100, 500, 1000];

/** Round-length choices offered on the start screen's question-count slider. */
export const QUESTION_COUNT_OPTIONS = [10, 15, 20];

/** How long a wrong answer locks the buttons for (tunable), in milliseconds. */
export const WRONG_COOLDOWN_MS = 3000;

/** Brief pause after a correct answer so the highlight is visible before advancing. */
const CORRECT_ADVANCE_DELAY_MS = 400;

preload("correct", "../../assets/sounds/correct.mp3");
preload("wrong", "../../assets/sounds/wrong.mp3");
preload("celebrate", "../../assets/sounds/celebrate.mp3");

/** In-memory round state — never persisted (a reload simply restarts the round). */
const state = {
  operationId: operations[0].id,
  maxResult: MAX_RESULT_OPTIONS[1],
  questionCount: QUESTION_COUNT_OPTIONS[0],
  questions: [],
  index: 0,
  startTime: null,
  positionCounts: [0, 0, 0],
};

/** Best time for the round's config, snapshotted at start so the in-game HUD can race it. */
let roundBestTimeSeconds = null;

/** DOM refs for the current play view, set by renderPlay(). */
let playRefs = null;

/** requestAnimationFrame id for the live running timer, or null when stopped. */
let timerFrameId = null;

const appEl = document.getElementById("app");

/**
 * Formats a duration in seconds to one decimal place for display.
 * @param {number} seconds
 * @returns {string}
 */
function formatSeconds(seconds) {
  return seconds.toFixed(1);
}

/**
 * Builds the storage key for a best-time record: `${op}-max${N}-q${M}`.
 * @param {string} operationId
 * @param {number} maxResult
 * @param {number} questionCount
 * @returns {string}
 */
function recordKey(operationId, maxResult, questionCount) {
  return `${operationId}-max${maxResult}-q${questionCount}`;
}

/**
 * Reads the best recorded time for a configuration, or null if none exists.
 * @param {string} operationId
 * @param {number} maxResult
 * @param {number} questionCount
 * @returns {number|null}
 */
function loadBestTime(operationId, maxResult, questionCount) {
  return storage.get(STORAGE_SCOPE, recordKey(operationId, maxResult, questionCount), null);
}

/**
 * Persists a new best time for a configuration.
 * @param {string} operationId
 * @param {number} maxResult
 * @param {number} questionCount
 * @param {number} seconds
 * @returns {void}
 */
function saveBestTime(operationId, maxResult, questionCount, seconds) {
  storage.set(STORAGE_SCOPE, recordKey(operationId, maxResult, questionCount), seconds);
}

/** Smallest spread allowed between the answer and a distractor. */
const OPTION_SPREAD_FLOOR = 2;

/** Largest spread allowed between the answer and a distractor. */
const OPTION_SPREAD_CAP = 20;

/**
 * Builds three unique, plausible answer options: the correct answer plus two
 * distractors that are close to it, non-negative, and different from it.
 * The spread between the answer and its distractors scales with the
 * *answer's* own magnitude (not maxResult) — so a small division answer like
 * 3 gets small, plausible neighbors (1, 2, 4, 5) instead of options scattered
 * across the whole maxResult range. Pure and testable in isolation from the
 * DOM/round state.
 * @param {number} answer - The correct result.
 * @param {number} maxResult - The round's configured max result (bounds the spread cap).
 * @returns {number[]} Exactly three unique numbers, in randomized order.
 */
export function makeOptions(answer, maxResult) {
  const options = new Set([answer]);
  const spread = clamp(
    Math.round(answer * 0.25),
    OPTION_SPREAD_FLOOR,
    Math.min(OPTION_SPREAD_CAP, maxResult)
  );

  const RANDOM_ATTEMPTS = 200;
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS && options.size < 3; attempt += 1) {
    const offset = randomInt(1, spread) * (randomInt(0, 1) === 0 ? -1 : 1);
    const candidate = answer + offset;
    if (candidate >= 0 && candidate !== answer) {
      options.add(candidate);
    }
  }

  // Fallback in the unlikely event randomness above couldn't fill 3 unique,
  // non-negative options (e.g. answer is 0 or 1, or the spread is tiny):
  // expand outward from the answer in both directions — +1, -1, +2, -2, ...
  // — skipping negatives and duplicates. This always terminates (the set of
  // non-negative integers is unbounded) and keeps every fallback option as
  // close to the answer as possible.
  let fallbackOffset = 1;
  while (options.size < 3) {
    const above = answer + fallbackOffset;
    if (!options.has(above)) {
      options.add(above);
    }
    if (options.size < 3) {
      const below = answer - fallbackOffset;
      if (below >= 0 && !options.has(below)) {
        options.add(below);
      }
    }
    fallbackOffset += 1;
  }

  const values = [...options];
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

/** How many times to re-roll a question toward an as-yet-unused result. */
const FRESH_RESULT_ATTEMPTS = 12;

/**
 * Pre-generates an entire round's worth of questions with no repeated (a,b)
 * pair and — as far as the config allows — no repeated result, so answers stay
 * varied. If the configuration doesn't have enough unique combinations, the
 * round is capped to however many questions could be produced.
 * @param {import("./operations.js").Operation} operation
 * @param {number} maxResult
 * @param {number} requestedCount
 * @returns {import("./operations.js").Question[]}
 */
function buildRound(operation, maxResult, requestedCount) {
  const usedKeys = new Set();
  const usedResults = new Set();
  const questions = [];
  for (let i = 0; i < requestedCount; i += 1) {
    let question = operation.generate(maxResult, usedKeys);
    if (!question) {
      break;
    }
    // Prefer a result not used yet this round: re-roll a few times, keeping the
    // first pick once the fresh-result pool is exhausted.
    for (
      let attempt = 0;
      attempt < FRESH_RESULT_ATTEMPTS && usedResults.has(question.answer);
      attempt += 1
    ) {
      const next = operation.generate(maxResult, usedKeys);
      if (!next) {
        break;
      }
      question = next;
    }
    usedKeys.add(operation.key(question.a, question.b));
    usedResults.add(question.answer);
    questions.push(question);
  }
  return questions;
}

/**
 * Replaces the page's view container with a single root element.
 * @param {HTMLElement} viewEl
 * @returns {void}
 */
function setView(viewEl) {
  appEl.replaceChildren(viewEl);
}

/**
 * Builds the operation selector: one chip per registered operation, showing
 * its **symbol** (not its name) with an accessible label so screen readers
 * still announce the operation. Adding a future operation only requires a
 * new entry in `operations` — it automatically gets its own symbol chip
 * here, no changes to this function.
 * @param {() => void} onChange - Called after the selection changes.
 * @returns {HTMLElement}
 */
function buildOperationGroup(onChange) {
  const group = document.createElement("div");
  group.className = "fastcalc-group";

  const label = document.createElement("p");
  label.className = "fastcalc-group__label";
  label.textContent = t("fastCalc.start.operation");
  group.append(label);

  const optionsRow = document.createElement("div");
  optionsRow.className = "fastcalc-group__options";
  optionsRow.setAttribute("role", "group");
  optionsRow.setAttribute("aria-label", t("fastCalc.start.operation"));

  const entries = [];
  for (const operation of operations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip fastcalc-choice fastcalc-choice--op";
    button.textContent = operation.symbol;
    button.setAttribute("aria-label", t(operation.labelKey));
    button.setAttribute("aria-pressed", String(operation.id === state.operationId));
    button.addEventListener("click", () => {
      state.operationId = operation.id;
      for (const [otherOperation, otherButton] of entries) {
        otherButton.setAttribute("aria-pressed", String(otherOperation.id === state.operationId));
      }
      onChange();
    });
    entries.push([operation, button]);
    optionsRow.append(button);
  }

  group.append(optionsRow);
  return group;
}

/**
 * Builds the max-result difficulty slider: a native range input snapping
 * across the discrete `MAX_RESULT_OPTIONS` values (index-based), styled with
 * a green-to-red difficulty gradient on its track.
 * @param {() => void} onChange - Called after the value changes.
 * @returns {HTMLElement}
 */
function buildMaxResultGroup(onChange) {
  const group = document.createElement("div");
  group.className = "fastcalc-group";

  const labelRow = document.createElement("div");
  labelRow.className = "fastcalc-group__label-row";

  const labelEl = document.createElement("label");
  labelEl.className = "fastcalc-group__label";
  labelEl.htmlFor = "fastcalc-max-result";
  labelEl.textContent = t("fastCalc.start.maxResult");

  const valueEl = document.createElement("span");
  valueEl.className = "fastcalc-group__value";
  valueEl.textContent = String(state.maxResult);

  labelRow.append(labelEl, valueEl);
  group.append(labelRow);

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = "fastcalc-max-result";
  slider.className = "fastcalc-slider fastcalc-slider--difficulty";
  slider.min = "0";
  slider.max = String(MAX_RESULT_OPTIONS.length - 1);
  slider.step = "1";
  slider.value = String(MAX_RESULT_OPTIONS.indexOf(state.maxResult));
  slider.setAttribute("aria-valuetext", String(state.maxResult));

  slider.addEventListener("input", () => {
    state.maxResult = MAX_RESULT_OPTIONS[Number(slider.value)];
    valueEl.textContent = String(state.maxResult);
    slider.setAttribute("aria-valuetext", String(state.maxResult));
    onChange();
  });

  group.append(slider);
  return group;
}

/**
 * Builds the question-count slider: a native range input over
 * `QUESTION_COUNT_OPTIONS` (min/max/step derived from the array so it stays
 * in sync if the options ever change).
 * @param {() => void} onChange - Called after the value changes.
 * @returns {HTMLElement}
 */
function buildQuestionCountGroup(onChange) {
  const group = document.createElement("div");
  group.className = "fastcalc-group";

  const labelRow = document.createElement("div");
  labelRow.className = "fastcalc-group__label-row";

  const labelEl = document.createElement("label");
  labelEl.className = "fastcalc-group__label";
  labelEl.htmlFor = "fastcalc-question-count";
  labelEl.textContent = t("fastCalc.start.questionCount");

  const valueEl = document.createElement("span");
  valueEl.className = "fastcalc-group__value";
  valueEl.textContent = String(state.questionCount);

  labelRow.append(labelEl, valueEl);
  group.append(labelRow);

  const min = QUESTION_COUNT_OPTIONS[0];
  const max = QUESTION_COUNT_OPTIONS[QUESTION_COUNT_OPTIONS.length - 1];
  const step = QUESTION_COUNT_OPTIONS[1] - QUESTION_COUNT_OPTIONS[0];

  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = "fastcalc-question-count";
  slider.className = "fastcalc-slider";
  slider.min = String(min);
  slider.max = String(max);
  slider.step = String(step);
  slider.value = String(state.questionCount);

  slider.addEventListener("input", () => {
    state.questionCount = Number(slider.value);
    valueEl.textContent = String(state.questionCount);
    onChange();
  });

  group.append(slider);
  return group;
}

/**
 * Renders the start screen: operation / max result / question count
 * selectors, the best-time record for the current selection, and the Start
 * icon button.
 * @returns {void}
 */
function renderStart() {
  setBackHandler(null);

  const container = document.createElement("div");
  container.className = "fastcalc-start";

  const heading = document.createElement("h2");
  heading.className = "fastcalc-heading";
  heading.textContent = t("fastCalc.title");
  container.append(heading);

  const recordEl = document.createElement("p");
  recordEl.className = "fastcalc-record";

  /** Refreshes the record line for the currently selected configuration. */
  function updateRecordDisplay() {
    const bestTime = loadBestTime(state.operationId, state.maxResult, state.questionCount);
    recordEl.textContent =
      bestTime === null
        ? t("fastCalc.start.noRecord")
        : t("fastCalc.start.bestTime", { time: formatSeconds(bestTime) });
  }

  container.append(buildOperationGroup(updateRecordDisplay));
  container.append(buildMaxResultGroup(updateRecordDisplay));
  container.append(buildQuestionCountGroup(updateRecordDisplay));

  updateRecordDisplay();
  container.append(recordEl);

  const clockLabel = document.createElement("label");
  clockLabel.className = "fastcalc-clock-toggle";
  const clockCheckbox = document.createElement("input");
  clockCheckbox.type = "checkbox";
  clockCheckbox.checked = storage.isClockShown();
  clockCheckbox.addEventListener("change", () => storage.setClockShown(clockCheckbox.checked));
  const clockText = document.createElement("span");
  clockText.textContent = `⏱ ${t("fastCalc.start.showClock")}`;
  clockLabel.append(clockCheckbox, clockText);
  container.append(clockLabel);

  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "btn btn--success fastcalc-start-btn";
  startButton.setAttribute("aria-label", t("fastCalc.start.play"));
  const startIcon = document.createElement("span");
  startIcon.setAttribute("aria-hidden", "true");
  startIcon.textContent = "▶";
  startButton.append(startIcon);
  startButton.addEventListener("click", handleStartRound);
  container.append(startButton);

  setView(container);
}

/**
 * Starts a new round: builds the no-repeat question list, snapshots the
 * config's current best time (for the in-game HUD to race), and switches to
 * the play view.
 * @returns {void}
 */
function handleStartRound() {
  const operation = getOperation(state.operationId);
  state.questions = buildRound(operation, state.maxResult, state.questionCount);
  state.index = 0;
  state.startTime = null;
  state.positionCounts = [0, 0, 0];
  roundBestTimeSeconds = loadBestTime(state.operationId, state.maxResult, state.questionCount);
  renderPlay();
}

/**
 * Renders the play view's static skeleton once per round — including the
 * HUD (live timer + best-time-to-beat, when one exists) — then shows
 * question 1 and starts the live timer loop.
 * @returns {void}
 */
function renderPlay() {
  setBackHandler(renderStart);

  const container = document.createElement("div");
  container.className = "fastcalc-play";

  const hud = document.createElement("div");
  hud.className = "fastcalc-hud";

  const progress = document.createElement("div");
  progress.className = "fastcalc-progress";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", String(state.questions.length));
  const progressDots = [];
  for (let i = 0; i < state.questions.length; i += 1) {
    const dot = document.createElement("span");
    dot.className = "fastcalc-progress__dot";
    dot.setAttribute("aria-hidden", "true");
    progress.append(dot);
    progressDots.push(dot);
  }
  hud.append(progress);

  const showClock = storage.isClockShown();
  let timer = null;
  if (showClock) {
    timer = document.createElement("p");
    timer.className = "fastcalc-hud__timer";
    hud.append(timer);
  }

  if (roundBestTimeSeconds !== null) {
    const record = document.createElement("p");
    record.className = "fastcalc-hud__record";
    record.textContent = t("fastCalc.play.record", { time: formatSeconds(roundBestTimeSeconds) });
    hud.append(record);
  }

  container.append(hud);

  const equation = document.createElement("p");
  equation.className = "fastcalc-equation";
  container.append(equation);

  const optionsRow = document.createElement("div");
  optionsRow.className = "fastcalc-options";
  container.append(optionsRow);

  const cooldown = document.createElement("p");
  cooldown.className = "fastcalc-cooldown";
  cooldown.hidden = true;
  container.append(cooldown);

  playRefs = { progress, progressDots, timer, equation, optionsRow, cooldown };

  setView(container);
  showQuestion();
  if (showClock) {
    startLiveTimer();
  }
}

/**
 * Starts (or restarts) the live running-timer display, updated every frame
 * via requestAnimationFrame for a smooth read-out. Safe to call repeatedly.
 * @returns {void}
 */
function startLiveTimer() {
  stopLiveTimer();

  const tick = () => {
    if (playRefs && playRefs.timer && state.startTime !== null) {
      const elapsedSeconds = (performance.now() - state.startTime) / 1000;
      playRefs.timer.textContent = t("fastCalc.play.timer", {
        time: formatSeconds(elapsedSeconds),
      });
    }
    timerFrameId = window.requestAnimationFrame(tick);
  };
  timerFrameId = window.requestAnimationFrame(tick);
}

/**
 * Stops the live running-timer loop, if running.
 * @returns {void}
 */
function stopLiveTimer() {
  if (timerFrameId !== null) {
    window.cancelAnimationFrame(timerFrameId);
    timerFrameId = null;
  }
}

/**
 * Picks the index of the least-used answer slot (ties broken randomly), so the
 * correct answer's position varies across a round instead of clustering.
 * @param {number[]} counts - Per-slot usage tally.
 * @returns {number}
 */
function leastUsedPosition(counts) {
  const min = Math.min(...counts);
  const candidates = counts.map((count, i) => (count === min ? i : -1)).filter((i) => i >= 0);
  return candidates[randomInt(0, candidates.length - 1)];
}

/**
 * Renders the current question into the existing play view. Starts the timer
 * the first time it runs (i.e. when question 1 is first shown).
 * @returns {void}
 */
function showQuestion() {
  if (state.startTime === null) {
    state.startTime = performance.now();
  }

  const question = state.questions[state.index];
  const operation = getOperation(state.operationId);

  const total = state.questions.length;
  playRefs.progress.setAttribute("aria-valuenow", String(state.index));
  playRefs.progress.setAttribute(
    "aria-label",
    t("fastCalc.play.progress", { current: state.index + 1, total })
  );
  playRefs.progressDots.forEach((dot, i) => {
    dot.classList.toggle("is-done", i < state.index);
    dot.classList.toggle("is-current", i === state.index);
  });
  playRefs.equation.textContent = `${question.a} ${operation.symbol} ${question.b} = ▢`;

  const optionValues = makeOptions(question.answer, state.maxResult);
  // Balance which slot (1/2/3) holds the correct answer across the round.
  const targetSlot = leastUsedPosition(state.positionCounts);
  const correctSlot = optionValues.indexOf(question.answer);
  [optionValues[targetSlot], optionValues[correctSlot]] = [
    optionValues[correctSlot],
    optionValues[targetSlot],
  ];
  state.positionCounts[targetSlot] += 1;
  playRefs.optionsRow.replaceChildren();
  playRefs.optionsRow.classList.remove("is-locked");
  for (const value of optionValues) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn fastcalc-option";
    button.textContent = String(value);
    button.addEventListener("click", () => handleAnswer(value, question.answer, button));
    playRefs.optionsRow.append(button);
  }
}

/**
 * Handles an answer button click: advances on correct (with a quick success
 * animation + sound), or marks + cools down on wrong.
 * @param {number} value - The value on the button that was clicked.
 * @param {number} correctAnswer - The question's correct answer.
 * @param {HTMLButtonElement} buttonEl - The clicked button element.
 * @returns {void}
 */
function handleAnswer(value, correctAnswer, buttonEl) {
  if (playRefs.optionsRow.classList.contains("is-locked")) {
    return;
  }

  if (value === correctAnswer) {
    playSound("correct");
    // The success animation (flash + scale/✓ pop) is pure CSS on .is-correct;
    // it's automatically reduced to color/✓-only under prefers-reduced-motion
    // (see reset.css's global animation-duration override).
    buttonEl.classList.add("is-correct");
    playRefs.optionsRow.classList.add("is-locked");
    advanceAfterCorrect();
    return;
  }

  playSound("wrong");
  buttonEl.classList.add("is-wrong");
  buttonEl.disabled = true;
  startCooldown();
}

/**
 * Moves to the next question (or finishes the round) after a short pause.
 * @returns {void}
 */
function advanceAfterCorrect() {
  const isLastQuestion = state.index + 1 >= state.questions.length;
  window.setTimeout(() => {
    if (isLastQuestion) {
      finishRound();
    } else {
      state.index += 1;
      showQuestion();
    }
  }, CORRECT_ADVANCE_DELAY_MS);
}

/**
 * Locks the answer buttons for WRONG_COOLDOWN_MS with a live countdown. The
 * previously wrong button stays disabled once the cooldown ends; the
 * running timer (and HUD) keeps ticking throughout — the lost time is the
 * penalty.
 * @returns {void}
 */
function startCooldown() {
  playRefs.optionsRow.classList.add("is-locked");
  const buttons = [...playRefs.optionsRow.querySelectorAll("button")];
  for (const button of buttons) {
    button.disabled = true;
  }

  playRefs.cooldown.hidden = false;
  const startedAt = performance.now();

  const tick = () => {
    const remainingMs = Math.max(0, WRONG_COOLDOWN_MS - (performance.now() - startedAt));
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    playRefs.cooldown.textContent = t("fastCalc.play.cooldown", { seconds: remainingSeconds });

    if (remainingMs <= 0) {
      window.clearInterval(intervalId);
      playRefs.cooldown.hidden = true;
      playRefs.optionsRow.classList.remove("is-locked");
      for (const button of buttons) {
        if (!button.classList.contains("is-wrong")) {
          button.disabled = false;
        }
      }
    }
  };

  tick();
  const intervalId = window.setInterval(tick, 100);
}

/**
 * Computes the elapsed time, stops the live timer, compares/updates the
 * best-time record, and shows the finish view.
 * @returns {void}
 */
function finishRound() {
  stopLiveTimer();

  const elapsedSeconds = (performance.now() - state.startTime) / 1000;
  const { operationId, maxResult, questionCount } = state;

  const previousBest = loadBestTime(operationId, maxResult, questionCount);
  let gapKey = "fastCalc.finish.newRecord";
  let gapVars = {};

  if (previousBest === null) {
    saveBestTime(operationId, maxResult, questionCount, elapsedSeconds);
  } else if (elapsedSeconds < previousBest) {
    gapKey = "fastCalc.finish.fasterBy";
    gapVars = { seconds: formatSeconds(previousBest - elapsedSeconds) };
    saveBestTime(operationId, maxResult, questionCount, elapsedSeconds);
  } else {
    gapKey = "fastCalc.finish.slowerBy";
    gapVars = { seconds: formatSeconds(elapsedSeconds - previousBest) };
  }

  renderFinish(elapsedSeconds, gapKey, gapVars);
}

/**
 * Renders the finish view: time, record comparison, confetti, and next actions.
 * @param {number} elapsedSeconds
 * @param {string} gapKey - i18n key describing the gap vs the prior record.
 * @param {Object<string, string>} gapVars - Interpolation vars for gapKey.
 * @returns {void}
 */
function renderFinish(elapsedSeconds, gapKey, gapVars) {
  setBackHandler(renderStart);

  const container = document.createElement("div");
  container.className = "fastcalc-finish";

  const heading = document.createElement("h2");
  heading.className = "fastcalc-heading";
  heading.textContent = t("fastCalc.finish.title");
  container.append(heading);

  const timeEl = document.createElement("p");
  timeEl.className = "fastcalc-finish__time";
  timeEl.textContent = t("fastCalc.finish.time", { time: formatSeconds(elapsedSeconds) });
  container.append(timeEl);

  const gapEl = document.createElement("p");
  gapEl.className = "fastcalc-finish__gap";
  gapEl.textContent = t(gapKey, gapVars);
  container.append(gapEl);

  const actions = document.createElement("div");
  actions.className = "fastcalc-finish__actions";

  const againButton = document.createElement("button");
  againButton.type = "button";
  againButton.className = "btn btn--success";
  againButton.textContent = t("fastCalc.finish.playAgain");
  againButton.addEventListener("click", handleStartRound);
  actions.append(againButton);

  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "btn btn--outline";
  backButton.textContent = t("fastCalc.finish.backToStart");
  backButton.addEventListener("click", () => {
    state.questions = [];
    state.index = 0;
    state.startTime = null;
    renderStart();
  });
  actions.append(backButton);

  container.append(actions);
  setView(container);

  playSound("celebrate");
  launchConfetti(container);
}

/**
 * Boots the game: shared header + RTL setup, then the start screen.
 * @returns {void}
 */
function init() {
  applyDir();
  renderHeader(document.getElementById("page-header"), { title: t("fastCalc.title") });
  renderStart();
}

init();
