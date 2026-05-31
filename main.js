/**
 * main.js — Entry point (DLC-aware)
 *
 * Wires: data.js, game.js, render.js, drag.js, store.js
 * Flow: pack list → pack internal → level → game
 */

import * as Data from './data.js';
import * as Game from './game.js';
import * as Render from './render.js';
import * as Drag from './drag.js';
import * as Store from './store.js';

// --- Theme (localStorage, tiny) ---
let currentTheme = 'dark';

function setTheme(theme) {
  currentTheme = theme;
  Render.applyTheme(theme);
  try { localStorage.setItem('block2lock_theme', theme); } catch (e) { }
}

function toggleTheme() {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// --- Current UI state ---
let currentSortMode = 'asc'; // 'asc' | 'desc'

// --- Pack display name ---

function getPackName(packId) {
  const info = Data.getPackInfo(packId);
  return info ? info.name : packId;
}

// --- Level entry ---
let enteringLevel = false;

async function enterLevel(packId, index) {
  if (enteringLevel) return;
  enteringLevel = true;
  try {
  const vehicles = Game.loadLevel(packId, index);
  if (!vehicles) return;

  Render.renderBoard(vehicles);
  for (let i = 0; i < vehicles.length; i++) Drag.attachDragEvent(i);

  const meta = await Store.getMeta(packId);
  const bestScore = await Store.getScore(packId, index);
  const bestHistory = await Store.getHistory(packId, index);
  const favs = await Store.getFavorites(packId);

  Render.updateDisplays(getPackName(packId), index, 0, bestScore ? bestScore.moves : null);
  Render.updateButtons(index, 0, Game.getLevelCount(), bestHistory);
  Render.setFavoriteState(favs.has(index));
  Render.hideWinModal();

  // Persist current level
  meta.currentLevel = index;
  await Store.setMeta(packId, meta);
  } finally { enteringLevel = false; }
}

// --- Game actions ---

async function handleMoveEnd(vehicleIndex, cellsMoved) {
  Game.applyMove(vehicleIndex, cellsMoved);
  const vehicles = Game.getVehicles();
  Render.updateVehiclePosition(vehicleIndex, vehicles[vehicleIndex]);

  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const bestScore = await Store.getScore(packId, levelIdx);
  const bestHistory = await Store.getHistory(packId, levelIdx);

  Render.updateDisplays(getPackName(packId), levelIdx, Game.getMoves(), bestScore ? bestScore.moves : null);
  Render.updateButtons(levelIdx, Game.getMoves(), Game.getLevelCount(), bestHistory);

  if (vehicleIndex === 0) {
    const result = Game.checkWin();
    if (result) await handleWin(result);
  }
}

async function handleWin(result) {
  Render.disableAllControls();
  Render.stopLevelMarquee();

  const playerEl = document.getElementById('vehicle-0');
  if (playerEl) playerEl.classList.add('animate-win');

  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const oldScore = await Store.getScore(packId, levelIdx);

  // Determine best status: 'new' (broke record), 'tied', or null (worse)
  let bestStatus = null;
  if (!oldScore) bestStatus = 'new';
  else if (result.moves < oldScore.moves) bestStatus = 'new';
  else if (result.moves === oldScore.moves) bestStatus = 'tied';

  // Save score and history for new or tied records
  if (bestStatus) {
    await Store.setScore(packId, levelIdx, result.moves);
    const history = Game.getMoveHistory();
    if (history.length > 0) {
      await Store.setHistory(packId, levelIdx, [...history]);
    }
  }

  setTimeout(async () => {
    // Guard: only show modal if still on the same level
    if (Game.getPackId() !== packId || Game.getLevelIndex() !== levelIdx) return;
    const updatedScore = await Store.getScore(packId, levelIdx);
    Render.showWinModal(result.moves, updatedScore ? updatedScore.moves : null, bestStatus);
    setupWinModalEasterEgg();
  }, 400);
}

async function handleUndo() {
  const move = Game.undo();
  if (!move) return;
  const vehicles = Game.getVehicles();
  Render.updateVehiclePosition(move.vehicleIndex, vehicles[move.vehicleIndex]);

  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const bestScore = await Store.getScore(packId, levelIdx);
  const bestHistory = await Store.getHistory(packId, levelIdx);

  Render.updateDisplays(getPackName(packId), levelIdx, Game.getMoves(), bestScore ? bestScore.moves : null);
  Render.updateButtons(levelIdx, Game.getMoves(), Game.getLevelCount(), bestHistory);
}

async function handleReplay() {
  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const history = await Store.getHistory(packId, levelIdx);
  if (!history) return;

  await enterLevel(packId, levelIdx);
  Render.disableAllControls();
  await sleep(100);

  for (let i = 0; i < history.length - 1; i++) {
    const { vehicleIndex, cellsMoved } = history[i];
    const vehicles = Game.getVehicles();
    const v = vehicles[vehicleIndex];
    v.hz ? (v.x += cellsMoved) : (v.y += cellsMoved);
    Render.updateVehiclePosition(vehicleIndex, v);
    document.getElementById('moves-display').textContent = i + 1;
    await sleep(400);
  }

  const playerEl = document.getElementById('vehicle-0');
  if (playerEl) playerEl.classList.add('animate-win');
  document.getElementById('moves-display').textContent = history.length;
  await sleep(800);
  await enterLevel(packId, levelIdx);
}

async function handleFavorite() {
  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const added = await Store.toggleFavorite(packId, levelIdx);
  Render.setFavoriteState(added);
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- Easter egg ---

let hiddenClickCount = 0;
let hiddenClickTimer = null;
let winModalCleanup = null;

function setupWinModalEasterEgg() {
  if (winModalCleanup) { winModalCleanup(); winModalCleanup = null; }
  hiddenClickCount = 0;
  if (hiddenClickTimer) { clearTimeout(hiddenClickTimer); hiddenClickTimer = null; }

  winModalCleanup = Render.onWinModalClick((e) => {
    if (!e.target.closest('h2')) return;
    if (hiddenClickTimer) clearTimeout(hiddenClickTimer);
    hiddenClickCount++;

    if (hiddenClickCount >= 3) {
      // Easter egg: reveal hidden message
      Render.showHiddenSwitchText();
      hiddenClickCount = 0;
      return;
    }
    hiddenClickTimer = setTimeout(() => { hiddenClickCount = 0; }, 1000);
  });
}

// --- Level select flow ---

async function handleLevelSelect() {
  // Directly open pack internal for current pack
  await openPackInternal(Game.getPackId());
}

function showPackList() {
  Render.hideLevelSelect();
  const packs = Data.getAvailablePacks();
  const loaded = Data.getLoadedPacks();
  Render.showPackList(packs, loaded, {
    onSelect: (packId) => { Render.hidePackSelect(); openPackInternal(packId); },
    onDownload: (packId) => downloadPack(packId),
  });
}

async function openPackInternal(packId) {
  // Ensure pack is loaded
  if (!Data.getLoadedPacks().has(packId)) {
    const ok = await Data.loadDLC(packId);
    if (!ok) return;
  }

  const info = Data.getPackInfo(packId);
  if (!info) return;
  const total = Data.getLevelCountForPack(packId);
  const scoresMap = await Store.getAllScores(packId);
  const favoritesSet = await Store.getFavorites(packId);

  Render.showLevelSelect(info.name, total, scoresMap, favoritesSet, currentSortMode, {
    onSelect: (idx) => { Render.hideLevelSelect(); enterLevel(packId, idx); },
    onBack: () => showPackList(),
    onDelete: () => Render.showDeleteModal(info.name, () => deletePackFromInternal(packId)),
    onRandom: () => Render.showRandomModal((mode) => handleRandom(packId, total, scoresMap, mode)),
    onSortChange: (mode) => { currentSortMode = mode; openPackInternal(packId); },
  });
}

async function handleRandom(packId, total, scoresMap, mode) {
  let candidates = [];

  for (let i = 0; i < total; i++) {
    const score = scoresMap.get(i);
    if (mode === 'unplayed' && score === undefined) candidates.push(i);
    else if (mode === 'any') candidates.push(i);
  }

  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  Render.hideLevelSelect();
  await enterLevel(packId, pick);
}

// --- DLC download/delete ---

let downloading = false;
async function downloadPack(packId) {
  if (downloading) return;
  downloading = true;
  try {
    const ok = await Data.loadDLC(packId);
    if (ok) showPackList();
  } finally {
    downloading = false;
  }
}

async function deletePackFromInternal(packId) {
  const currentPack = Game.getPackId();
  Data.unloadDLC(packId);
  await Store.deletePackData(packId);
  Render.hideLevelSelect();

  // If current game is in the deleted pack, return to base
  if (currentPack === packId) {
    const baseMeta = await Store.getMeta('base');
    await enterLevel('base', baseMeta.currentLevel);
  }
}

// --- Modal next ---

async function handleModalNext() {
  const packId = Game.getPackId();
  const levelIdx = Game.getLevelIndex();
  const total = Game.getLevelCount();

  let nextIdx = levelIdx + 1;
  if (nextIdx >= total) nextIdx = 0;
  await enterLevel(packId, nextIdx);
}

// --- Init ---

async function init() {
  Render.cacheElements();

  // Init IndexedDB first (data.js needs it)
  await Store.init();

  // Init data (base + dlc.json + restore downloaded DLCs)
  await Data.init();

  // Load base pack meta
  const baseMeta = await Store.getMeta('base');

  // Theme
  try {
    const saved = localStorage.getItem('block2lock_theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved); else setTheme('dark');
  } catch (e) { setTheme('dark'); }

  // Init drag module
  Drag.initDrag(
    () => Game.getVehicles(),
    () => Render.getCellSize(),
    handleMoveEnd,
    () => Game.isGameWon()
  );

  // Init render events
  Render.initEvents({
    onPrev: () => enterLevel(Game.getPackId(), Game.getLevelIndex() - 1),
    onNext: () => enterLevel(Game.getPackId(), Game.getLevelIndex() + 1),
    onReset: () => enterLevel(Game.getPackId(), Game.getLevelIndex()),
    onUndo: handleUndo,
    onReplay: handleReplay,
    onLevelSelect: handleLevelSelect,
    onRandom: async (mode) => {
      const packId = Game.getPackId();
      const total = Game.getLevelCount();
      const scoresMap = await Store.getAllScores(packId);
      handleRandom(packId, total, scoresMap, mode);
    },
    onThemeToggle: toggleTheme,
    onFavorite: handleFavorite,
    onModalNext: handleModalNext,
  });

  Render.hideHiddenSwitchText();

  // Enter saved level
  await enterLevel('base', baseMeta.currentLevel);
}

init();
