/**
 * maze.js — pure board model for the numbers-maze game: grid dimensions,
 * orthogonal path generation, and distractor fill. No DOM access anywhere in
 * this file, so it is fully unit-testable in isolation from the browser.
 */

import { randomInt, sample, shuffle } from "../../shared/js/util.js";

/**
 * Grid dimensions (cols x rows) per supported count. Portrait-shaped
 * (rows >= cols) to match a phone held upright; cell counts are
 * ~1.35-1.6x the path length N, giving the generator enough slack to route
 * without heavy backtracking while keeping a meaningful distractor density.
 * 75 and 100 are out of scope for this version (see tinyspec req. 2).
 * @type {Object<number, {cols: number, rows: number}>}
 */
export const GRID_BY_COUNT = {
  10: { cols: 4, rows: 4 },
  25: { cols: 5, rows: 7 },
  50: { cols: 7, rows: 10 },
};

/** Node-expansion cap per generation attempt — guarantees termination. */
const MAX_EXPANSIONS_PER_ATTEMPT = 20000;

/** Fresh-random-start attempts before falling back to a deterministic path. */
const MAX_RESTARTS = 10;

/** Distractor value pool floor — keeps the N=10 board varied. */
const DISTRACTOR_POOL_FLOOR = 12;

/** Random-sample rejections allowed per cell before scanning for any legal value. */
const PLACEMENT_REJECTION_LIMIT = 20;

/**
 * Converts row/col grid coordinates to a flat cell index (row-major).
 * @param {number} row
 * @param {number} col
 * @param {number} cols
 * @returns {number}
 */
function toIndex(row, col, cols) {
  return row * cols + col;
}

/**
 * Returns the in-bounds orthogonal neighbours of a cell (never diagonal).
 * @param {number} row
 * @param {number} col
 * @param {number} cols
 * @param {number} rows
 * @returns {[number, number][]}
 */
function orthogonalNeighbors(row, col, cols, rows) {
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ].filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols);
}

/**
 * Flood-fills the unvisited region reachable from (row, col) — (row, col)
 * itself counts toward the size, whether or not it is itself in `visited`.
 * @param {number} row
 * @param {number} col
 * @param {number} cols
 * @param {number} rows
 * @param {Set<number>} visited
 * @returns {number} Size of the reachable unvisited region, candidate included.
 */
function reachableUnvisitedCount(row, col, cols, rows, visited) {
  const startKey = toIndex(row, col, cols);
  const seen = new Set([startKey]);
  const stack = [[row, col]];
  while (stack.length > 0) {
    const [r, c] = stack.pop();
    for (const [nr, nc] of orthogonalNeighbors(r, c, cols, rows)) {
      const key = toIndex(nr, nc, cols);
      if (!visited.has(key) && !seen.has(key)) {
        seen.add(key);
        stack.push([nr, nc]);
      }
    }
  }
  return seen.size;
}

/**
 * A single randomized DFS attempt from one random start cell: at each step,
 * candidates are the unvisited orthogonal neighbours, connectivity-pruned
 * (their reachable unvisited region, candidate included, must be large
 * enough to still finish the path) and ordered by a Warnsdorff-style
 * heuristic (fewest onward unvisited neighbours first, random tie-break).
 * Backtracks on dead ends; gives up once MAX_EXPANSIONS_PER_ATTEMPT node
 * expansions have been spent.
 * @param {number} cols
 * @param {number} rows
 * @param {number} n
 * @returns {[number, number][]|null} The path (row/col pairs), or null on failure.
 */
function attemptRandomizedPath(cols, rows, n) {
  const start = [randomInt(0, rows - 1), randomInt(0, cols - 1)];
  const visited = new Set([toIndex(start[0], start[1], cols)]);
  const path = [start];
  let expansions = 0;

  function backtrack() {
    if (path.length === n) {
      return true;
    }

    const [row, col] = path[path.length - 1];
    const remainingNeeded = n - path.length; // cells still needed, candidate included

    const candidates = orthogonalNeighbors(row, col, cols, rows)
      .filter(([r, c]) => !visited.has(toIndex(r, c, cols)))
      .map(([r, c]) => {
        // Reachable region from (r, c): computed before (r, c) itself is
        // marked visited, so it is correctly counted as part of its own region.
        const reachable = reachableUnvisitedCount(r, c, cols, rows, visited);
        const key = toIndex(r, c, cols);
        visited.add(key);
        const degree = orthogonalNeighbors(r, c, cols, rows).filter(
          ([nr, nc]) => !visited.has(toIndex(nr, nc, cols))
        ).length;
        visited.delete(key);
        return { row: r, col: c, degree, reachable };
      })
      // Connectivity prune: necessary, not sufficient (a reachable region can
      // still have a bottleneck) — backtracking below still has to do the rest.
      .filter((candidate) => candidate.reachable >= remainingNeeded);

    // Warnsdorff-style ordering: fewest onward options first, random tie-break
    // (shuffle first so equal-degree candidates land in random order, then a
    // stable sort by ascending degree preserves that random order within ties).
    const ordered = shuffle(candidates).sort((a, b) => a.degree - b.degree);

    for (const candidate of ordered) {
      expansions += 1;
      if (expansions > MAX_EXPANSIONS_PER_ATTEMPT) {
        return false;
      }
      const key = toIndex(candidate.row, candidate.col, cols);
      visited.add(key);
      path.push([candidate.row, candidate.col]);
      if (backtrack()) {
        return true;
      }
      path.pop();
      visited.delete(key);
    }
    return false;
  }

  return backtrack() ? path : null;
}

/**
 * Deterministic serpentine (boustrophedon) fallback path: row-by-row through
 * the first `ceil(n / cols)` rows, alternating direction each row, trimmed to
 * exactly n cells. Always succeeds — the correctness backstop when every
 * randomized attempt fails.
 * @param {number} cols
 * @param {number} rows
 * @param {number} n
 * @returns {[number, number][]}
 */
function boustrophedonPath(cols, rows, n) {
  const path = [];
  const neededRows = Math.min(rows, Math.ceil(n / cols));
  for (let row = 0; row < neededRows && path.length < n; row += 1) {
    const leftToRight = row % 2 === 0;
    for (let step = 0; step < cols && path.length < n; step += 1) {
      const col = leftToRight ? step : cols - 1 - step;
      path.push([row, col]);
    }
  }
  return path;
}

/**
 * Generates a non-self-intersecting orthogonal path of exactly `n` cells in a
 * `cols x rows` grid: up to MAX_RESTARTS randomized DFS attempts from fresh
 * random starts, falling back to a deterministic boustrophedon path if every
 * attempt fails (guarantees the game always starts).
 * @param {number} cols
 * @param {number} rows
 * @param {number} n
 * @returns {{ path: [number, number][], usedFallback: boolean }}
 */
export function generatePath(cols, rows, n) {
  for (let attempt = 0; attempt < MAX_RESTARTS; attempt += 1) {
    const path = attemptRandomizedPath(cols, rows, n);
    if (path) {
      return { path, usedFallback: false };
    }
  }
  return { path: boustrophedonPath(cols, rows, n), usedFallback: true };
}

/**
 * Fills every non-path cell of the grid with a distractor value, so the
 * board reads as one number family and the puzzle is a genuine search.
 * - Pool = 1..max(n, 12).
 * - Hard rule A: a distractor `v` is never placed orthogonally adjacent to
 *   the path cell holding `v - 1`.
 * - Hard rule B: 1 and N are reserved for the path — never used as distractors.
 * - Soft rule: prefer values used fewer times so far.
 * @param {number} cols
 * @param {number} rows
 * @param {[number, number][]} path - Path cells in order, path[i] holds value i+1.
 * @param {number} n - The path length (and the winning number).
 * @returns {number[]} Flat, row-major array of length cols*rows.
 */
export function fillDistractors(cols, rows, path, n) {
  const totalCells = cols * rows;
  const pool = Math.max(n, DISTRACTOR_POOL_FLOOR);

  const values = new Array(totalCells).fill(null);
  path.forEach(([row, col], i) => {
    values[toIndex(row, col, cols)] = i + 1;
  });

  const usageCount = new Map();
  for (let v = 1; v <= pool; v += 1) {
    usageCount.set(v, 0);
  }
  path.forEach((_, i) => usageCount.set(i + 1, usageCount.get(i + 1) + 1));

  // Candidate distractor values exclude 1 and n entirely (Hard rule B: those
  // two values appear exactly once on the whole board, on the path only).
  const candidatePool = [];
  for (let v = 1; v <= pool; v += 1) {
    if (v !== 1 && v !== n) {
      candidatePool.push(v);
    }
  }

  // Precompute, for each candidate value v, the set of grid positions
  // orthogonally adjacent to the path cell holding v - 1 (Hard rule A).
  const forbiddenPositionsByValue = new Map();
  for (const v of candidatePool) {
    const forbidden = new Set();
    const previousValue = v - 1;
    if (previousValue >= 1 && previousValue <= n) {
      const [pr, pc] = path[previousValue - 1];
      for (const [nr, nc] of orthogonalNeighbors(pr, pc, cols, rows)) {
        forbidden.add(toIndex(nr, nc, cols));
      }
    }
    forbiddenPositionsByValue.set(v, forbidden);
  }

  function isLegal(value, index) {
    return !forbiddenPositionsByValue.get(value).has(index);
  }

  function pickLeastUsed(values_) {
    let min = Infinity;
    for (const v of values_) {
      const used = usageCount.get(v);
      if (used < min) {
        min = used;
      }
    }
    return sample(values_.filter((v) => usageCount.get(v) === min));
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = toIndex(row, col, cols);
      if (values[index] !== null) {
        continue; // path cell, already filled
      }

      let placed = false;
      for (let attempt = 0; attempt < PLACEMENT_REJECTION_LIMIT && !placed; attempt += 1) {
        const candidate = pickLeastUsed(candidatePool);
        if (isLegal(candidate, index)) {
          values[index] = candidate;
          usageCount.set(candidate, usageCount.get(candidate) + 1);
          placed = true;
        }
      }

      if (!placed) {
        // A legal value always exists here: at most 4 values are forbidden
        // per cell (its up to 4 neighbours' v-1 memberships) against a pool
        // of >= 12 candidates. Scan in ascending-usage order (soft rule).
        const byUsage = [...candidatePool].sort((a, b) => usageCount.get(a) - usageCount.get(b));
        for (const v of byUsage) {
          if (isLegal(v, index)) {
            values[index] = v;
            usageCount.set(v, usageCount.get(v) + 1);
            placed = true;
            break;
          }
        }
      }
    }
  }

  return values;
}

/**
 * @typedef {Object} MazeCell
 * @property {number} row
 * @property {number} col
 * @property {number} value
 */

/**
 * @typedef {Object} MazeBoard
 * @property {number} cols
 * @property {number} rows
 * @property {MazeCell[]} cells - Flat, row-major.
 * @property {number[]} pathIndex - `pathIndex[i]` is the cell index holding value i+1.
 * @property {boolean} usedFallback - Whether path generation needed the boustrophedon fallback.
 */

/**
 * Builds a full playable board for a given count: dimensions, a generated
 * path, and distractor fill.
 * @param {number} count - One of the keys of GRID_BY_COUNT (10, 25, or 50).
 * @returns {MazeBoard}
 */
export function buildBoard(count) {
  const { cols, rows } = GRID_BY_COUNT[count];
  const { path, usedFallback } = generatePath(cols, rows, count);
  const values = fillDistractors(cols, rows, path, count);

  const cells = values.map((value, index) => ({
    row: Math.floor(index / cols),
    col: index % cols,
    value,
  }));
  const pathIndex = path.map(([row, col]) => toIndex(row, col, cols));

  return { cols, rows, cells, pathIndex, usedFallback };
}
