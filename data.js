/**
 * data.js — Level data module (multi-pack, on-demand)
 *
 * Stores raw Uint8Array per pack. Level strings are sliced on demand.
 * Memory: 1x binary size (no string array overhead).
 */

import * as Store from './store.js';

const LEVEL_SIZE = 36;
const COLS = 6;

let dlcPacks = [];              // manifest from dlc.json
let loadedPacks = new Map();    // packId → Uint8Array

// --- On-demand level string ---

function getBoardFromBuffer(buf, index) {
  const offset = index * LEVEL_SIZE;
  let s = '';
  for (let j = 0; j < LEVEL_SIZE; j++) s += String.fromCharCode(buf[offset + j]);
  return s;
}

// --- Board parsing ---

function boardToObjects(board) {
  const map = new Map();
  for (let i = 0; i < board.length; i++) {
    const ch = board[i];
    if (ch === 'o') continue;
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    let entry = map.get(ch);
    if (!entry) {
      entry = { minRow: row, minCol: col, maxRow: row, maxCol: col, count: 0, rows: new Set(), cols: new Set() };
      map.set(ch, entry);
    }
    if (row < entry.minRow) entry.minRow = row;
    if (col < entry.minCol) entry.minCol = col;
    if (row > entry.maxRow) entry.maxRow = row;
    if (col > entry.maxCol) entry.maxCol = col;
    entry.count++;
    entry.rows.add(row);
    entry.cols.add(col);
  }

  const playerObj = { x: 0, y: 0, length: 2, hz: true };
  const others = [];
  for (const [ch, e] of map) {
    if (e.count < 2) continue;
    const length = e.cols.size > e.rows.size ? e.maxCol - e.minCol + 1 : e.maxRow - e.minRow + 1;
    const hz = e.cols.size > e.rows.size;
    const obj = { x: e.minCol, y: e.minRow, length, hz };
    if (ch === 'A') Object.assign(playerObj, obj); else others.push(obj);
  }
  others.sort((a, b) => a.y - b.y || a.x - b.x);
  return [playerObj, ...others];
}

// --- Validation ---

function validateBuffer(buf) {
  if (buf.length === 0 || buf.length % LEVEL_SIZE !== 0) {
    throw new Error(`Invalid bin size: ${buf.length} (not a multiple of ${LEVEL_SIZE})`);
  }
}

// --- Init ---

export async function init() {
  // Load base
  const res = await fetch('lvl_base.bin');
  if (!res.ok) throw new Error(`Failed to load lvl_base.bin: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  validateBuffer(buf);
  loadedPacks.set('base', buf);

  // Restore previously downloaded DLC packs from IndexedDB
  const downloaded = await Store.getDownloadedPackIds();
  for (const packId of downloaded) {
    try {
      const data = await Store.loadDLCBin(packId);
      if (data) {
        const bytes = new Uint8Array(data);
        validateBuffer(bytes);
        loadedPacks.set(packId, bytes);
      }
    } catch (e) {
      console.warn(`Corrupt DLC ${packId}, removing:`, e.message);
      await Store.deleteDLCBin(packId);
    }
  }

  // Load DLC manifest
  try {
    const dlcRes = await fetch('dlc/dlc.json');
    if (dlcRes.ok) dlcPacks = await dlcRes.json();
  } catch (e) {
    console.warn('dlc.json unavailable, using local DLC data');
  }

  // Offline fallback: build manifest from downloaded packs
  if (dlcPacks.length === 0 && downloaded.size > 0) {
    for (const packId of downloaded) {
      const buf = loadedPacks.get(packId);
      if (buf) {
        const moves = packId === 'dlc_30plus' ? '30+' : parseInt(packId.replace('dlc_', ''), 10);
        dlcPacks.push({
          id: packId,
          name: packId === 'dlc_30plus' ? 'DLC 30+' : `DLC ${moves}`,
          moves,
          count: buf.length / LEVEL_SIZE,
          size: buf.length,
          file: `${packId}.bin`,
        });
      }
    }
  }
}

// --- DLC loading ---

export async function loadDLC(packId) {
  if (loadedPacks.has(packId)) return true;
  const pack = dlcPacks.find(p => p.id === packId);
  if (!pack) return false;

  try {
    const res = await fetch(`dlc/${pack.file}`);
    if (!res.ok) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    validateBuffer(buf);
    loadedPacks.set(packId, buf);
    await Store.saveDLCBin(packId, buf.buffer);
    return true;
  } catch (e) {
    console.error(`Failed to load DLC ${packId}:`, e);
    return false;
  }
}

export function unloadDLC(packId) {
  if (packId === 'base') return;
  loadedPacks.delete(packId);
}

// --- Getters ---

export function getAvailablePacks() {
  return dlcPacks;
}

export function getLoadedPacks() {
  return new Set(loadedPacks.keys());
}

export function getPackInfo(packId) {
  if (packId === 'base') return { id: 'base', name: 'Classic', moves: null, count: getLevelCountForPack('base'), file: 'lvl_base.bin' };
  return dlcPacks.find(p => p.id === packId) || null;
}

export function getLevelCountForPack(packId) {
  const buf = loadedPacks.get(packId);
  return buf ? buf.length / LEVEL_SIZE : 0;
}

export function getLevelObjects(packId, index) {
  const buf = loadedPacks.get(packId);
  const count = buf ? buf.length / LEVEL_SIZE : 0;
  if (!buf || index < 0 || index >= count) return null;
  return boardToObjects(getBoardFromBuffer(buf, index));
}
