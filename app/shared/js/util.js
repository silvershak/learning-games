/**
 * util.js — small, pure helper functions shared across games.
 */

/**
 * Returns a new array with the same items in randomized order
 * (Fisher-Yates shuffle). Does not mutate the input.
 * @template T
 * @param {T[]} array
 * @returns {T[]} A new, shuffled array.
 */
export function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Returns a random integer in the inclusive range [min, max].
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

/**
 * Clamps a number to the inclusive range [min, max].
 * @param {number} n
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/**
 * Returns a random element from an array, or undefined if it's empty.
 * @template T
 * @param {T[]} array
 * @returns {T|undefined}
 */
export function sample(array) {
  if (array.length === 0) {
    return undefined;
  }
  return array[randomInt(0, array.length - 1)];
}
