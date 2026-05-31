/**
 * render.js — All DOM manipulation (pack-aware)
 *
 * Two-layer level select:
 *   Layer 1: Pack list (showPackList)
 *   Layer 2: Pack internal grid (showPackInternal) with lazy loading, sort, random
 */

// --- DOM refs ---
let els = {};
let cellSize = 0;

// --- Callbacks ---
let callbacks = {};

function isNumber(v) { return typeof v === 'number' && !Number.isNaN(v); }
function formatSize(bytes) { return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + 'MB' : (bytes / 1024).toFixed(0) + 'KB'; }

const GAP = '0.25rem';
const HALF_GAP = '0.125rem';
const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function formatLevel(idx) {
  let n = idx + 1, s = '';
  while (n > 0) { s = B62[n % 62] + s; n = Math.floor(n / 62); }
  return s.padStart(3, '0');
}

// --- Init ---

export function cacheElements() {
  els = {
    board: document.getElementById('board'),
    gameContainer: document.getElementById('game-container'),
    packDisplay: document.getElementById('pack-display'),
    levelDisplay: document.getElementById('level-display'),
    movesDisplay: document.getElementById('moves-display'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    resetBtn: document.getElementById('reset-btn'),
    undoBtn: document.getElementById('undo-btn'),
    replayBtn: document.getElementById('replay-btn'),
    randomBtn: document.getElementById('random-btn'),
    levelDisplayBtn: document.getElementById('level-display-btn'),
    winModal: document.getElementById('win-modal'),
    winMoves: document.getElementById('win-moves'),
    winMessage: document.getElementById('win-message'),
    winBestScore: document.getElementById('win-best-score'),
    modalNextBtn: document.getElementById('modal-next-btn'),
    packSelectModal: document.getElementById('pack-select-modal'),
    packGrid: document.getElementById('pack-grid'),
    closePackSelectBtn: document.getElementById('close-pack-select-btn'),
    levelSelectModal: document.getElementById('level-select-modal'),
    levelGrid: document.getElementById('level-grid'),
    closeLevelSelectBtn: document.getElementById('close-level-select-btn'),
    bestScoreDisplay: document.getElementById('best-score-display'),
    themeToggle: document.getElementById('theme-toggle'),
    favoriteBtn: document.querySelector('.favorite-btn'),
    hiddenSwitchText: document.getElementById('hidden-switch-text'),
    randomModal: document.getElementById('random-modal'),
    randomUnplayedBtn: document.getElementById('random-unplayed-btn'),
    randomAnyBtn: document.getElementById('random-any-btn'),
    randomCloseBtn: document.getElementById('random-close-btn'),
    deleteModal: document.getElementById('delete-modal'),
    deleteConfirmBtn: document.getElementById('delete-confirm-btn'),
    deleteCancelBtn: document.getElementById('delete-cancel-btn'),
    deletePackName: document.getElementById('delete-pack-name'),
  };
}

export function initEvents(cbs) {
  Object.assign(callbacks, cbs);
  els.prevBtn.addEventListener('click', () => callbacks.onPrev?.());
  els.nextBtn.addEventListener('click', () => callbacks.onNext?.());
  els.resetBtn.addEventListener('click', () => callbacks.onReset?.());
  els.undoBtn.addEventListener('click', () => callbacks.onUndo?.());
  els.replayBtn.addEventListener('click', () => callbacks.onReplay?.());
  els.levelDisplayBtn.addEventListener('click', () => callbacks.onLevelSelect?.());
  els.randomBtn.addEventListener('click', () => showRandomModal(callbacks.onRandom));
  els.closePackSelectBtn.addEventListener('click', hidePackSelect);
  els.closeLevelSelectBtn.addEventListener('click', hideLevelSelect);
  els.themeToggle.addEventListener('click', () => callbacks.onThemeToggle?.());
  els.favoriteBtn.addEventListener('click', () => callbacks.onFavorite?.());
  els.modalNextBtn.addEventListener('click', () => callbacks.onModalNext?.());

  if (els.board) {
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => { cellSize = els.board.clientWidth / 6; });
      ro.observe(els.board);
    }
    cellSize = els.board.clientWidth / 6;
  }
}

// --- Theme ---

export function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
}

// --- Board rendering ---

export function renderBoard(vehicles) {
  if (!els.board) return;
  els.board.innerHTML = '';

  vehicles.forEach((v, i) => {
    const el = document.createElement('div');
    el.id = `vehicle-${i}`;
    const isPlayer = i === 0;
    let extraClasses = '';
    if (isPlayer) extraClasses = ' vehicle-player';
    const colorIndex = isPlayer ? 0 : ((i - 1) % 11) + 1;
    el.className = `vehicle vehicle-${colorIndex} ${extraClasses}`;
    el.style.width = v.hz ? `calc(100%/6 * ${v.length} - ${GAP})` : `calc(100%/6 - ${GAP})`;
    el.style.height = v.hz ? `calc(100%/6 - ${GAP})` : `calc(100%/6 * ${v.length} - ${GAP})`;
    el.style.top = `calc(100%/6 * ${v.y} + ${HALF_GAP})`;
    el.style.left = `calc(100%/6 * ${v.x} + ${HALF_GAP})`;
    el.style.transition = 'top 0.2s ease, left 0.2s ease';
    el.style.zIndex = '5';
    els.board.appendChild(el);
  });

  const exit = document.createElement('div');
  exit.className = 'exit-label';
  exit.textContent = 'EXIT →';
  exit.style.width = 'calc(100%/6)';
  exit.style.height = 'calc(100%/6)';
  exit.style.top = 'calc(100%/6 * 2)';
  exit.style.left = 'calc(100%/6 * 5)';
  exit.style.zIndex = '1';
  els.board.appendChild(exit);
}

export function updateVehiclePosition(idx, vehicle) {
  const el = document.getElementById(`vehicle-${idx}`);
  if (!el) return;
  el.style.top = `calc(100%/6 * ${vehicle.y} + ${HALF_GAP})`;
  el.style.left = `calc(100%/6 * ${vehicle.x} + ${HALF_GAP})`;
}

// --- Displays ---

export function updateDisplays(packName, levelIndex, moves, bestScore) {
  els.packDisplay.textContent = packName;
  els.levelDisplay.textContent = formatLevel(levelIndex);
  els.movesDisplay.textContent = moves;
  els.bestScoreDisplay.textContent = isNumber(bestScore) ? bestScore : '--';
}

// --- Buttons ---

export function updateButtons(levelIndex, moves, totalLevels, bestHistory) {
  els.prevBtn.disabled = levelIndex === 0;
  els.nextBtn.disabled = levelIndex >= totalLevels - 1;
  els.resetBtn.disabled = moves === 0;
  els.undoBtn.disabled = moves === 0;
  els.replayBtn.disabled = !bestHistory || bestHistory.length === 0;
  els.modalNextBtn.disabled = false;
}

export function disableAllControls() {
  els.prevBtn.disabled = true;
  els.nextBtn.disabled = true;
  els.resetBtn.disabled = true;
  els.undoBtn.disabled = true;
  els.replayBtn.disabled = true;
}

// --- Win Modal ---

export function showWinModal(moves, bestScore, bestStatus) {
  els.winMoves.textContent = moves;

  if (bestStatus === 'new') {
    els.winMessage.textContent = "New Best Record!";
    els.winBestScore.textContent = '';
    els.winBestScore.classList.add('new-best');
  } else if (bestStatus === 'tied') {
    els.winMessage.textContent = "Tied Best Record!";
    els.winBestScore.textContent = '';
    els.winBestScore.classList.add('new-best');
  } else {
    els.winMessage.textContent = '';
    els.winBestScore.textContent = `Best: ${bestScore} moves`;
    els.winBestScore.classList.remove('new-best');
  }
  els.winModal.classList.add('is-visible');
}

export function hideWinModal() {
  els.winModal.classList.remove('is-visible');
}

export function onWinModalClick(handler) {
  els.winModal.addEventListener('click', handler);
  return () => els.winModal.removeEventListener('click', handler);
}

// --- Pack Select Modal ---

export function showPackList(packs, downloadedPacks, { onSelect, onDownload }) {
  els.packGrid.innerHTML = '';

  // Base pack
  els.packGrid.appendChild(createPackRow('Classic', '401', true, () => onSelect('base'), null, null));

  // DLC packs
  for (const pack of packs) {
    const downloaded = downloadedPacks.has(pack.id);
    els.packGrid.appendChild(createPackRow(
      pack.name, pack.count.toLocaleString(), downloaded,
      () => onSelect(pack.id),
      () => onDownload(pack.id),
      downloaded ? null : formatSize(pack.size)
    ));
  }

  els.packSelectModal.classList.add('is-visible');
}

export function hidePackSelect() {
  els.packSelectModal.classList.remove('is-visible');
}

function createPackRow(name, count, downloaded, onEnter, onDownload, sizeStr) {
  const row = document.createElement('button');
  row.className = 'pack-row';

  const left = document.createElement('span');
  left.className = 'pack-row-name';
  left.textContent = name;

  const center = document.createElement('span');
  center.className = 'pack-row-info';
  center.textContent = sizeStr ? `${count} [${sizeStr}]` : count;

  const right = document.createElement('span');
  right.innerHTML = downloaded ? '▶' : '⬇';

  row.appendChild(left);
  row.appendChild(center);
  row.appendChild(right);
  row.addEventListener('click', downloaded ? onEnter : onDownload);
  return row;
}

// --- Level Select Modal (original style) ---

const BATCH_SIZE = 200;
let lazyObserver = null;
let actionRow = null;

export function showLevelSelect(packName, totalCount, scoresMap, favoritesSet, sortMode, cbs) {
  els.levelGrid.innerHTML = '';

  // h2: pack name
  const h2 = els.levelSelectModal.querySelector('h2');
  if (h2) { h2.textContent = packName; }

  // Action row: [Packs] [Random] [↑/↓] [Delete]
  cleanupActionRow();
  actionRow = document.createElement('div');
  actionRow.className = 'level-actions';

  const btnStyle = 'action-btn';

  const packsBtn = document.createElement('button');
  packsBtn.textContent = 'Packs';
  packsBtn.className = btnStyle;
  packsBtn.onclick = cbs.onBack;

  const randomBtn = document.createElement('button');
  randomBtn.textContent = 'Random';
  randomBtn.className = btnStyle;
  randomBtn.onclick = cbs.onRandom;

  const sortBtn = document.createElement('button');
  sortBtn.textContent = sortMode === 'asc' ? '↑' : '↓';
  sortBtn.className = btnStyle;
  sortBtn.onclick = () => cbs.onSortChange(sortMode === 'asc' ? 'desc' : 'asc');

  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.className = btnStyle;
  delBtn.onclick = cbs.onDelete;

  actionRow.appendChild(packsBtn);
  actionRow.appendChild(randomBtn);
  actionRow.appendChild(sortBtn);
  actionRow.appendChild(delBtn);
  els.levelGrid.parentElement.insertBefore(actionRow, els.levelGrid);

  // Build sorted levels
  const levels = buildSortedLevels(totalCount, scoresMap, favoritesSet, sortMode);

  // Render first batch
  const fragment = document.createDocumentFragment();
  const end = Math.min(BATCH_SIZE, levels.length);
  for (let i = 0; i < end; i++) {
    fragment.appendChild(createLevelButton(levels[i], favoritesSet, cbs.onSelect));
  }
  els.levelGrid.appendChild(fragment);

  // Lazy load
  if (end < levels.length) {
    let loaded = end;
    const sentinel = document.createElement('div');
    sentinel.className = 'level-sentinel';
    els.levelGrid.appendChild(sentinel);

    cleanupLazyObserver();
    lazyObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && loaded < levels.length) {
        const frag = document.createDocumentFragment();
        const nextEnd = Math.min(loaded + BATCH_SIZE, levels.length);
        for (let i = loaded; i < nextEnd; i++) {
          frag.appendChild(createLevelButton(levels[i], favoritesSet, cbs.onSelect));
        }
        els.levelGrid.insertBefore(frag, sentinel);
        loaded = nextEnd;
        if (loaded >= levels.length) { sentinel.remove(); cleanupLazyObserver(); }
      }
    }, { root: els.levelGrid });
    lazyObserver.observe(sentinel);
  }

  els.levelSelectModal.classList.add('is-visible');
}

function cleanupLazyObserver() {
  if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
}

function cleanupActionRow() {
  if (actionRow) { actionRow.remove(); actionRow = null; }
}

function buildSortedLevels(totalCount, scoresMap, favoritesSet, sortMode) {
  const levels = [];
  for (let i = 0; i < totalCount; i++) {
    const score = scoresMap.get(i);
    const fav = favoritesSet.has(i);
    // Group: 0=favorite, 1=completed, 2=unplayed
    const group = fav ? 0 : (score !== undefined ? 1 : 2);
    levels.push({ index: i, score, fav, group });
  }
  const asc = sortMode === 'asc';
  levels.sort((a, b) => {
    // First: group order (favorites → completed → unplayed)
    if (a.group !== b.group) return a.group - b.group;
    // Within same group:
    if (a.group === 1) {
      // Completed: sort by score, then index
      if (a.score !== b.score) return asc ? a.score - b.score : b.score - a.score;
    }
    // Favorites & unplayed: sort by index
    return asc ? a.index - b.index : b.index - a.index;
  });
  return levels;
}

function createLevelButton(level, favoritesSet, onSelect) {
  const btn = document.createElement('button');
  btn.className = 'level-btn';
  btn.textContent = formatLevel(level.index);

  // Favorite heart (top-left)
  if (level.fav) {
    const heart = document.createElement('span');
    heart.className = 'fav-star';
    heart.textContent = '♥';
    btn.appendChild(heart);
  }

  // Score badge (bottom-right)
  if (level.score !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'best-score-display';
    badge.textContent = level.score;
    btn.appendChild(badge);
  }

  btn.addEventListener('click', () => onSelect(level.index));
  return btn;
}

// --- Random Modal ---

export function showRandomModal(onRandom) {
  els.randomUnplayedBtn.onclick = () => { hideRandomModal(); onRandom('unplayed'); };
  els.randomAnyBtn.onclick = () => { hideRandomModal(); onRandom('any'); };
  els.randomCloseBtn.onclick = hideRandomModal;
  els.randomModal.classList.add('is-visible');
}

function hideRandomModal() {
  els.randomModal.classList.remove('is-visible');
}

// --- Delete Confirmation Modal ---

export function showDeleteModal(packName, onConfirm) {
  els.deletePackName.textContent = `Deleting ${packName}`;
  els.deleteConfirmBtn.onclick = () => { hideDeleteModal(); onConfirm(); };
  els.deleteCancelBtn.onclick = hideDeleteModal;
  els.deleteModal.classList.add('is-visible');
}

function hideDeleteModal() {
  els.deleteModal.classList.remove('is-visible');
}

// --- Hide level select ---

export function hideLevelSelect() {
  cleanupLazyObserver();
  cleanupActionRow();
  els.levelSelectModal.classList.remove('is-visible');
}

// --- Hidden switch text ---

export function showHiddenSwitchText() {
  if (els.hiddenSwitchText) els.hiddenSwitchText.classList.add('visible');
}

export function hideHiddenSwitchText() {
  if (els.hiddenSwitchText) els.hiddenSwitchText.classList.remove('visible');
}

// --- Favorite button ---

export function setFavoriteState(isFavorited) {
  if (els.favoriteBtn) els.favoriteBtn.classList.toggle('active', isFavorited);
}

// --- Cell size ---

export function getCellSize() { return cellSize; }
