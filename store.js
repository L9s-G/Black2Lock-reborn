/**
 * store.js — IndexedDB persistence layer
 *
 * Database: Block2LockDB
 *   meta      — { packId } → { currentLevel }
 *   scores    — [packId, levelIndex] → { moves }
 *   histories — [packId, levelIndex] → { data: Uint8Array }
 */

const DB_NAME = 'Block2LockDB';
const DB_VERSION = 3;
let db = null;

// --- Init ---

export async function init() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      if (!d.objectStoreNames.contains('scores')) {
        const s = d.createObjectStore('scores');
        s.createIndex('packId', 'packId', { unique: false });
      }
      if (!d.objectStoreNames.contains('histories')) {
        const s = d.createObjectStore('histories');
        s.createIndex('packId', 'packId', { unique: false });
      }
      if (!d.objectStoreNames.contains('dlcBins')) d.createObjectStore('dlcBins');
      if (!d.objectStoreNames.contains('favorites')) {
        const s = d.createObjectStore('favorites');
        s.createIndex('packId', 'packId', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function assertDb() { if (!db) throw new Error('Store not initialized. Call init() first.'); }

// --- Meta ---

export async function getMeta(packId) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly');
    const req = tx.objectStore('meta').get(packId);
    req.onsuccess = () => resolve(req.result || { currentLevel: 0 });
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function setMeta(packId, meta) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(meta, packId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Scores ---

export async function getScore(packId, levelIndex) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scores', 'readonly');
    const req = tx.objectStore('scores').get([packId, levelIndex]);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function setScore(packId, levelIndex, moves) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scores', 'readwrite');
    tx.objectStore('scores').put({ packId, levelIndex, moves }, [packId, levelIndex]);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getAllScores(packId) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scores', 'readonly');
    const idx = tx.objectStore('scores').index('packId');
    const req = idx.getAll(packId);
    req.onsuccess = () => {
      const map = new Map();
      for (const entry of req.result) map.set(entry.levelIndex, entry.moves);
      resolve(map);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteScores(packId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('scores', 'readwrite');
    const idx = tx.objectStore('scores').index('packId');
    const req = idx.openCursor(packId);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Histories ---

export async function getHistory(packId, levelIndex) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('histories', 'readonly');
    const req = tx.objectStore('histories').get([packId, levelIndex]);
    req.onsuccess = () => {
      const result = req.result;
      if (!result || !result.data) { resolve(null); return; }
      resolve(unpackHistory(result.data));
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function setHistory(packId, levelIndex, moves) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('histories', 'readwrite');
    tx.objectStore('histories').put(
      { packId, levelIndex, data: packHistory(moves) },
      [packId, levelIndex]
    );
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function deleteHistories(packId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('histories', 'readwrite');
    const idx = tx.objectStore('histories').index('packId');
    const req = idx.openCursor(packId);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- Delete all data for a pack ---

export async function deletePackData(packId) {
  assertDb();
  await Promise.all([
    new Promise((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').delete(packId);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    }),
    deleteScores(packId),
    deleteHistories(packId),
    deleteDLCBin(packId),
    deleteFavorites(packId),
  ]);
}

// --- DLC Binary Storage ---

export async function saveDLCBin(packId, data) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dlcBins', 'readwrite');
    tx.objectStore('dlcBins').put(data, packId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function loadDLCBin(packId) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dlcBins', 'readonly');
    const req = tx.objectStore('dlcBins').get(packId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function deleteDLCBin(packId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dlcBins', 'readwrite');
    tx.objectStore('dlcBins').delete(packId);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function getDownloadedPackIds() {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dlcBins', 'readonly');
    const req = tx.objectStore('dlcBins').getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result));
    req.onerror = (e) => reject(e.target.error);
  });
}

// --- Favorites ---

export async function getFavorites(packId) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readonly');
    const idx = tx.objectStore('favorites').index('packId');
    const req = idx.getAll(packId);
    req.onsuccess = () => resolve(new Set(req.result.map(e => e.levelIndex)));
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function toggleFavorite(packId, levelIndex) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const store = tx.objectStore('favorites');
    let added = false;
    const req = store.get([packId, levelIndex]);
    req.onsuccess = () => {
      if (req.result) {
        store.delete([packId, levelIndex]);
        added = false;
      } else {
        store.put({ packId, levelIndex }, [packId, levelIndex]);
        added = true;
      }
    };
    tx.oncomplete = () => resolve(added);
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteFavorites(packId) {
  assertDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('favorites', 'readwrite');
    const idx = tx.objectStore('favorites').index('packId');
    const req = idx.openCursor(packId);
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- History packing (Uint8Array, 2 bytes per move) ---

function packHistory(moves) {
  const buf = new Uint8Array(moves.length * 2);
  for (let i = 0; i < moves.length; i++) {
    buf[i * 2] = moves[i].vehicleIndex & 0xFF;
    buf[i * 2 + 1] = moves[i].cellsMoved & 0xFF; // int8 via bitmask
  }
  return buf;
}

function unpackHistory(buf) {
  const moves = [];
  for (let i = 0; i < buf.length; i += 2) {
    let cellsMoved = buf[i + 1];
    if (cellsMoved > 127) cellsMoved -= 256; // sign extend
    moves.push({ vehicleIndex: buf[i], cellsMoved });
  }
  return moves;
}
