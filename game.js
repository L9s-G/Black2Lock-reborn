/**
 * game.js — Pure game state and logic (pack-aware)
 *
 * No DOM, no storage. Runtime state only.
 * Persistent state lives in store.js (IndexedDB).
 * Level data comes from data.js.
 */

import { getLevelCountForPack, getLevelObjects } from './data.js';

// --- Runtime state (reset on each level load) ---
let runtime = {
  packId: 'base',
  levelIndex: 0,
  moves: 0,
  vehicles: [],
  gameWon: false,
  moveHistory: [],
};

// --- Level management ---

/**
 * Load a level. Resets runtime state and returns vehicles.
 * Does NOT check unlock status — that's the caller's job.
 * @param {string} packId
 * @param {number} index
 * @returns {Array|null} vehicles or null if invalid
 */
export function loadLevel(packId, index) {
  const count = getLevelCountForPack(packId);
  if (index < 0 || index >= count) return null;

  runtime.packId = packId;
  runtime.levelIndex = index;
  runtime.moves = 0;
  runtime.moveHistory = [];
  runtime.vehicles = getLevelObjects(packId, index);
  runtime.gameWon = false;

  return runtime.vehicles;
}

// --- Game actions ---

export function applyMove(vehicleIndex, cellsMoved) {
  if (cellsMoved === 0 || runtime.gameWon) return;
  const v = runtime.vehicles[vehicleIndex];
  if (!v) return;
  if (Number.isNaN(cellsMoved)) return;
  if (v.hz) { v.x += cellsMoved; } else { v.y += cellsMoved; }
  runtime.moves++;
  runtime.moveHistory.push({ vehicleIndex, cellsMoved });
}

export function undo() {
  if (runtime.moves === 0 || runtime.gameWon) return null;
  const last = runtime.moveHistory.pop();
  if (!last) return null;
  const v = runtime.vehicles[last.vehicleIndex];
  if (!v) return null;
  if (v.hz) { v.x -= last.cellsMoved; } else { v.y -= last.cellsMoved; }
  runtime.moves--;
  return last;
}

/**
 * Check win condition.
 * @returns {{ isWin: true, moves: number } | null}
 */
export function checkWin() {
  if (runtime.gameWon) return null;
  const player = runtime.vehicles[0];
  if (!player || player.x + player.length < 6) return null;
  runtime.gameWon = true;
  return { isWin: true, moves: runtime.moves };
}

// --- Getters ---

export function getPackId() { return runtime.packId; }
export function getLevelIndex() { return runtime.levelIndex; }
export function getMoves() { return runtime.moves; }
export function getVehicles() { return runtime.vehicles; }
export function isGameWon() { return runtime.gameWon; }
export function getMoveHistory() { return [...runtime.moveHistory]; }
export function getLevelCount() { return getLevelCountForPack(runtime.packId); }
