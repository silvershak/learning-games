/**
 * operations.js — pluggable operation registry for the fast-calc game.
 *
 * Each operation owns its own generation rules and its canonical no-repeat
 * key. Adding a new operation (subtraction, multiplication, ...) later only
 * requires a new entry in `operations` plus its i18n label — the round
 * engine in game.js never needs to change.
 */

import { randomInt } from "../../shared/js/util.js";

/**
 * @typedef {Object} Question
 * @property {number} a - First operand.
 * @property {number} b - Second operand.
 * @property {string} text - Display text, e.g. "3 + 4".
 * @property {number} answer - The correct result.
 */

/**
 * @typedef {Object} Operation
 * @property {string} id - Short id used in storage keys, e.g. "add".
 * @property {string} symbol - Display symbol, e.g. "+".
 * @property {string} labelKey - i18n key for the operation's display name.
 * @property {(a: number, b: number) => string} key - Canonical no-repeat key for a pair.
 * @property {(maxResult: number, usedSet: Set<string>) => Question|null} generate -
 *   Produces a fresh question whose `key(a, b)` is not already in `usedSet`, or
 *   `null` once no unused combination remains for this configuration.
 */

/** Number of random attempts before falling back to an exhaustive scan. */
const RANDOM_ATTEMPTS = 30;

/**
 * Canonical key for an unordered pair — {a, b} and {b, a} are the same question.
 * @param {number} a
 * @param {number} b
 * @returns {string}
 */
function unorderedKey(a, b) {
  return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Addition: a, b >= 1 with a + b <= maxResult. The canonical no-repeat key is
 * the unordered pair {a, b} (3 + 4 and 4 + 3 count as the same question).
 * @type {Operation}
 */
const addition = {
  id: "add",
  symbol: "+",
  labelKey: "fastCalc.op.add",
  key: unorderedKey,
  generate(maxResult, usedSet) {
    if (maxResult < 2) {
      return null;
    }

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      const a = randomInt(1, maxResult - 1);
      const b = randomInt(1, maxResult - a);
      if (!usedSet.has(unorderedKey(a, b))) {
        return { a, b, text: `${a} + ${b}`, answer: a + b };
      }
    }

    // Random sampling kept colliding with used pairs (the round is close to
    // exhausting every unique combination for this maxResult) — fall back to
    // an exhaustive scan for any pair that is still unused.
    for (let a = 1; a <= maxResult - 1; a += 1) {
      for (let b = 1; b <= maxResult - a; b += 1) {
        if (!usedSet.has(unorderedKey(a, b))) {
          return { a, b, text: `${a} + ${b}`, answer: a + b };
        }
      }
    }

    return null;
  },
};

/**
 * Canonical key for an ordered pair — {a, b} and {b, a} are different
 * questions (order matters, e.g. subtraction and division).
 * @param {number} a
 * @param {number} b
 * @returns {string}
 */
function orderedKey(a, b) {
  return `${a}-${b}`;
}

/**
 * Subtraction: a in [1, maxResult], b in [1, a], answer = a - b (>= 0). The
 * canonical no-repeat key is the ordered pair (a, b) — order matters, since
 * "5 − 2" and "2 − 5" are not the same question (and the latter isn't even
 * generated, since b <= a).
 * @type {Operation}
 */
const subtraction = {
  id: "sub",
  symbol: "−",
  labelKey: "fastCalc.op.sub",
  key: orderedKey,
  generate(maxResult, usedSet) {
    if (maxResult < 1) {
      return null;
    }

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      const a = randomInt(1, maxResult);
      const b = randomInt(1, a);
      if (!usedSet.has(orderedKey(a, b))) {
        return { a, b, text: `${a} − ${b}`, answer: a - b };
      }
    }

    // Random sampling kept colliding with used pairs — fall back to an
    // exhaustive scan for any pair that is still unused.
    for (let a = 1; a <= maxResult; a += 1) {
      for (let b = 1; b <= a; b += 1) {
        if (!usedSet.has(orderedKey(a, b))) {
          return { a, b, text: `${a} − ${b}`, answer: a - b };
        }
      }
    }

    return null;
  },
};

/**
 * Multiplication: a, b >= 1 with a * b <= maxResult. The canonical no-repeat
 * key is the unordered pair {a, b} (3 × 4 and 4 × 3 count as the same
 * question).
 * @type {Operation}
 */
const multiplication = {
  id: "mul",
  symbol: "×",
  labelKey: "fastCalc.op.mul",
  key: unorderedKey,
  generate(maxResult, usedSet) {
    if (maxResult < 1) {
      return null;
    }

    // Keep factors small relative to the max result (≈ max ÷ 10, floored so small
    // maxes stay playable), so questions read like 7 × 8, not 100 × 1.
    const operandCap = Math.max(3, Math.floor(maxResult / 10));
    const aMax = Math.min(operandCap, maxResult);

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      const a = randomInt(1, aMax);
      const bMax = Math.min(operandCap, Math.floor(maxResult / a));
      if (bMax < 1) {
        continue;
      }
      const b = randomInt(1, bMax);
      if (!usedSet.has(unorderedKey(a, b))) {
        return { a, b, text: `${a} × ${b}`, answer: a * b };
      }
    }

    // Random sampling kept colliding with used pairs — fall back to an
    // exhaustive scan for any pair that is still unused.
    for (let a = 1; a <= aMax; a += 1) {
      for (let b = 1; b <= Math.min(operandCap, Math.floor(maxResult / a)); b += 1) {
        if (!usedSet.has(unorderedKey(a, b))) {
          return { a, b, text: `${a} × ${b}`, answer: a * b };
        }
      }
    }

    return null;
  },
};

/**
 * Division: whole-number only — choose divisor b >= 2 and quotient c >= 1
 * with dividend a = b * c <= maxResult. The shown question is `a ÷ b` and the
 * answer is c. The canonical no-repeat key is the ordered pair (a, b)
 * (dividend, divisor).
 * @type {Operation}
 */
const division = {
  id: "div",
  symbol: "÷",
  labelKey: "fastCalc.op.div",
  key: orderedKey,
  generate(maxResult, usedSet) {
    if (maxResult < 2) {
      return null;
    }

    for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt += 1) {
      const b = randomInt(2, maxResult);
      const maxC = Math.floor(maxResult / b);
      if (maxC < 1) {
        continue;
      }
      const c = randomInt(1, maxC);
      const a = b * c;
      if (!usedSet.has(orderedKey(a, b))) {
        return { a, b, text: `${a} ÷ ${b}`, answer: c };
      }
    }

    // Random sampling kept colliding with used pairs (or kept missing valid
    // divisors) — fall back to an exhaustive scan for any (a, b) still unused.
    for (let b = 2; b <= maxResult; b += 1) {
      for (let c = 1; b * c <= maxResult; c += 1) {
        const a = b * c;
        if (!usedSet.has(orderedKey(a, b))) {
          return { a, b, text: `${a} ÷ ${b}`, answer: c };
        }
      }
    }

    return null;
  },
};

/** All available operations, in the order shown on the start screen. */
export const operations = [addition, subtraction, multiplication, division];

/**
 * Looks up an operation by id, falling back to the first registered one.
 * @param {string} id
 * @returns {Operation}
 */
export function getOperation(id) {
  return operations.find((operation) => operation.id === id) ?? operations[0];
}
