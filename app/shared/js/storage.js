/**
 * storage.js — the ONLY module allowed to touch localStorage.
 *
 * Games and pages must never call `localStorage` directly; they go through
 * the API exported here. This keeps key-naming consistent (`lg:<scope>:<key>`),
 * keeps values JSON-safe, and lets the whole app keep working (in-memory,
 * non-persistent) when localStorage throws — e.g. Safari private mode, a
 * locked-down browser, or storage quota exceeded.
 *
 * Client-side storage is untrusted: a player can open devtools and edit any
 * value. Never trust stored data for anything security-sensitive; it only
 * gates convenience features like "next level unlocked".
 */

const PREFIX = "lg";

/** In-memory fallback store, used when localStorage is unavailable. */
const memoryStore = new Map();

/** Cached result of the localStorage probe (null until first checked). */
let storageAvailable = null;

/**
 * Detects whether localStorage can actually be used (some browsers expose
 * the API but throw on access, e.g. private browsing with strict settings).
 * @returns {boolean}
 */
function isStorageAvailable() {
  if (storageAvailable !== null) {
    return storageAvailable;
  }
  try {
    const probeKey = `${PREFIX}:__probe__`;
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

/**
 * Builds the namespaced storage key for a scope + key pair.
 * @param {string} scope - Logical namespace, e.g. a game id or "settings".
 * @param {string} key - Key within that scope.
 * @returns {string}
 */
function buildKey(scope, key) {
  return `${PREFIX}:${scope}:${key}`;
}

/**
 * Reads a JSON value from storage.
 * @param {string} scope - Logical namespace, e.g. a game id or "settings".
 * @param {string} key - Key within that scope.
 * @param {*} [fallback] - Value returned when nothing is stored, or on error.
 * @returns {*}
 */
export function get(scope, key, fallback) {
  const fullKey = buildKey(scope, key);
  try {
    if (isStorageAvailable()) {
      const raw = window.localStorage.getItem(fullKey);
      return raw === null ? fallback : JSON.parse(raw);
    }
    return memoryStore.has(fullKey) ? memoryStore.get(fullKey) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Writes a JSON-serializable value to storage.
 * @param {string} scope - Logical namespace, e.g. a game id or "settings".
 * @param {string} key - Key within that scope.
 * @param {*} value - Any JSON-serializable value.
 * @returns {void}
 */
export function set(scope, key, value) {
  const fullKey = buildKey(scope, key);
  try {
    if (isStorageAvailable()) {
      window.localStorage.setItem(fullKey, JSON.stringify(value));
      return;
    }
    memoryStore.set(fullKey, value);
  } catch {
    memoryStore.set(fullKey, value);
  }
}

/**
 * Removes a single stored value.
 * @param {string} scope - Logical namespace, e.g. a game id or "settings".
 * @param {string} key - Key within that scope.
 * @returns {void}
 */
export function remove(scope, key) {
  const fullKey = buildKey(scope, key);
  try {
    if (isStorageAvailable()) {
      window.localStorage.removeItem(fullKey);
    }
  } catch {
    // ignore — fall through to also clear the memory fallback below.
  }
  memoryStore.delete(fullKey);
}

/**
 * Removes every stored value under a scope.
 * @param {string} scope - Logical namespace, e.g. a game id or "settings".
 * @returns {void}
 */
export function clearScope(scope) {
  const scopePrefix = `${PREFIX}:${scope}:`;
  try {
    if (isStorageAvailable()) {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const storedKey = window.localStorage.key(i);
        if (storedKey && storedKey.startsWith(scopePrefix)) {
          keysToRemove.push(storedKey);
        }
      }
      keysToRemove.forEach((storedKey) => window.localStorage.removeItem(storedKey));
    }
  } catch {
    // ignore — memory fallback is cleared below regardless.
  }
  for (const memoryKey of [...memoryStore.keys()]) {
    if (memoryKey.startsWith(scopePrefix)) {
      memoryStore.delete(memoryKey);
    }
  }
}

/**
 * @typedef {Object} GameProgress
 * @property {number[]} unlockedSteps - Step indices the player has unlocked.
 * @property {Object<string, *>} [data] - Free-form per-game progress payload.
 */

const PROGRESS_KEY = "progress";

/** @type {GameProgress} */
const DEFAULT_PROGRESS = { unlockedSteps: [0], data: {} };

/**
 * Reads a game's saved progress.
 * @param {string} gameId - Unique id of the game (matches its folder name).
 * @returns {GameProgress}
 */
export function getProgress(gameId) {
  const stored = get(gameId, PROGRESS_KEY, DEFAULT_PROGRESS);
  return {
    unlockedSteps: Array.isArray(stored?.unlockedSteps)
      ? stored.unlockedSteps
      : DEFAULT_PROGRESS.unlockedSteps,
    data: typeof stored?.data === "object" && stored.data !== null ? stored.data : {},
  };
}

/**
 * Overwrites a game's saved progress.
 * @param {string} gameId - Unique id of the game (matches its folder name).
 * @param {GameProgress} data - Full progress object to persist.
 * @returns {void}
 */
export function setProgress(gameId, data) {
  set(gameId, PROGRESS_KEY, data);
}

/**
 * Checks whether a given step of a game has been unlocked.
 * @param {string} gameId - Unique id of the game.
 * @param {number} step - Step index to check.
 * @returns {boolean}
 */
export function isStepUnlocked(gameId, step) {
  const progress = getProgress(gameId);
  return progress.unlockedSteps.includes(step);
}

/**
 * Marks a step of a game as unlocked (idempotent).
 * @param {string} gameId - Unique id of the game.
 * @param {number} step - Step index to unlock.
 * @returns {void}
 */
export function unlockStep(gameId, step) {
  const progress = getProgress(gameId);
  if (!progress.unlockedSteps.includes(step)) {
    progress.unlockedSteps = [...progress.unlockedSteps, step].sort((a, b) => a - b);
    setProgress(gameId, progress);
  }
}

const SETTINGS_SCOPE = "settings";
const MUTED_KEY = "muted";

/**
 * Reads the global mute flag (used by audio.js).
 * @returns {boolean}
 */
export function isMuted() {
  return Boolean(get(SETTINGS_SCOPE, MUTED_KEY, false));
}

/**
 * Sets the global mute flag (used by audio.js).
 * @param {boolean} muted
 * @returns {void}
 */
export function setMuted(muted) {
  set(SETTINGS_SCOPE, MUTED_KEY, Boolean(muted));
}

const CLOCK_SHOWN_KEY = "clockShown";

/**
 * Reads whether the in-game clock/timer should be shown (defaults to true).
 * @returns {boolean}
 */
export function isClockShown() {
  return Boolean(get(SETTINGS_SCOPE, CLOCK_SHOWN_KEY, true));
}

/**
 * Sets whether the in-game clock/timer should be shown.
 * @param {boolean} shown
 * @returns {void}
 */
export function setClockShown(shown) {
  set(SETTINGS_SCOPE, CLOCK_SHOWN_KEY, Boolean(shown));
}

/**
 * Returns a storage API bound to one game's scope, so a game never repeats its
 * scope string. Pass the game's id — it MUST match the game's `games/manifest.js`
 * entry (the manifest is the id registry, so scopes are unique and never collide).
 * @param {string} gameId
 * @returns {{ get: (key: string, fallback?: *) => *, set: (key: string, value: *) => void, remove: (key: string) => void, clearScope: () => void }}
 */
export function scoped(gameId) {
  return {
    get: (key, fallback) => get(gameId, key, fallback),
    set: (key, value) => set(gameId, key, value),
    remove: (key) => remove(gameId, key),
    clearScope: () => clearScope(gameId),
  };
}
