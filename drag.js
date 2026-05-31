/**
 * drag.js — Drag interaction handling
 *
 * Encapsulates all mouse/touch drag logic.
 * Exposes attachDragEvent() to bind to vehicle elements after render.
 * Reports completed moves via onMoveEnd callback.
 */

let getVehicles = null;
let getCellSize = null;
let onMoveEnd = null;
let isGameWon = null;

const HALF_GAP = '0.125rem';

// --- Drag state (private) ---
let state = {
    active: false,
    vehicleIndex: -1,
    el: null,
    startPos: { x: 0, y: 0 },
    bounds: { min: 0, max: 0 },
};

/**
 * Initialize the drag module.
 * @param {Function} getVehiclesFn — returns current vehicles array
 * @param {Function} getCellSizeFn — returns current cell size in px
 * @param {Function} onMoveEndFn — (vehicleIndex, cellsMoved) callback
 * @param {Function} isGameWonFn — returns boolean
 */
export function initDrag(getVehiclesFn, getCellSizeFn, onMoveEndFn, isGameWonFn) {
    getVehicles = getVehiclesFn;
    getCellSize = getCellSizeFn;
    onMoveEnd = onMoveEndFn;
    isGameWon = isGameWonFn;
}

/**
 * Attach drag event listeners to a vehicle element.
 * Call this after renderBoard() creates the vehicle DOM elements.
 * @param {number} vehicleIndex
 */
export function attachDragEvent(vehicleIndex) {
    const el = document.getElementById(`vehicle-${vehicleIndex}`);
    if (!el) return;
    el.addEventListener('mousedown', (e) => handleStart(e, vehicleIndex));
    el.addEventListener('touchstart', (e) => handleStart(e, vehicleIndex), { passive: false });
}

// --- Collision grid (private) ---

function createCollisionGrid(vehicles, excludeIndex) {
    const grid = new Uint8Array(36); // 6x6 flat
    for (let i = 0; i < vehicles.length; i++) {
        if (i === excludeIndex) continue;
        const v = vehicles[i];
        for (let j = 0; j < v.length; j++) {
            const row = v.hz ? v.y : v.y + j;
            const col = v.hz ? v.x + j : v.x;
            if (row >= 0 && row < 6 && col >= 0 && col < 6) {
                grid[row * 6 + col] = 1;
            }
        }
    }
    return grid;
}

// --- Event position helper ---

function getPos(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

// --- Drag handlers ---

function handleStart(e, vehicleIndex) {
    if (!getVehicles || !isGameWon) return;
    if (isGameWon()) return;
    e.preventDefault();

    // Clean up previous drag if active (multi-touch)
    if (state.active && state.el) {
        state.el.style.transition = 'top 0.2s ease, left 0.2s ease';
        state.el.style.zIndex = '5';
        state.el.style.transform = 'none';
    }

    const vehicles = getVehicles();
    const vehicle = vehicles[vehicleIndex];
    const el = document.getElementById(`vehicle-${vehicleIndex}`);
    if (!el) return;

    state.active = true;
    state.vehicleIndex = vehicleIndex;
    state.el = el;
    state.startPos = getPos(e);

    el.style.transition = 'none';
    el.style.zIndex = '10';

    // Calculate drag bounds
    const grid = createCollisionGrid(vehicles, vehicleIndex);
    const cs = getCellSize();

    if (vehicle.hz) {
        let minX = vehicle.x;
        while (minX > 0 && !grid[vehicle.y * 6 + (minX - 1)]) minX--;
        let maxX = vehicle.x;
        while (maxX < (6 - vehicle.length) && !grid[vehicle.y * 6 + (maxX + vehicle.length)]) maxX++;
        state.bounds.min = (minX - vehicle.x) * cs;
        state.bounds.max = (maxX - vehicle.x) * cs;
    } else {
        let minY = vehicle.y;
        while (minY > 0 && !grid[(minY - 1) * 6 + vehicle.x]) minY--;
        let maxY = vehicle.y;
        while (maxY < (6 - vehicle.length) && !grid[(maxY + vehicle.length) * 6 + vehicle.x]) maxY++;
        state.bounds.min = (minY - vehicle.y) * cs;
        state.bounds.max = (maxY - vehicle.y) * cs;
    }

    // Remove any existing listeners first (prevent accumulation)
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('touchend', handleEnd);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
}

function handleMove(e) {
    if (!state.active) return;
    e.preventDefault();

    const pos = getPos(e);
    const vehicles = getVehicles();
    const vehicle = vehicles[state.vehicleIndex];
    const cs = getCellSize();

    let delta;
    if (vehicle.hz) {
        delta = pos.x - state.startPos.x;
        delta = Math.max(state.bounds.min, Math.min(delta, state.bounds.max));
        state.el.style.transform = `translateX(${delta}px)`;
    } else {
        delta = pos.y - state.startPos.y;
        delta = Math.max(state.bounds.min, Math.min(delta, state.bounds.max));
        state.el.style.transform = `translateY(${delta}px)`;
    }
}

function handleEnd(e) {
    if (!state.active) return;

    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('mouseup', handleEnd);
    document.removeEventListener('touchmove', handleMove);
    document.removeEventListener('touchend', handleEnd);

    const vehicles = getVehicles();
    const vehicle = vehicles[state.vehicleIndex];
    const el = state.el;
    const cs = getCellSize();

    // Read delta from transform
    let delta = 0;
    const transform = el.style.transform;
    if (transform) {
        const match = transform.match(/-?[\d.]+/);
        if (match) delta = parseFloat(match[0]);
    }

    let cellsMoved = cs > 0 ? Math.round(delta / cs) : 0;
    // Snap threshold: if within 30% of a cell, snap to that cell
    if (cs > 0) {
      const fraction = Math.abs(delta / cs) % 1;
      if (fraction > 0 && fraction < 0.3 && cellsMoved === 0) {
        cellsMoved = delta > 0 ? 1 : -1;
      }
    }

    // Snap to final position immediately (no animation to prevent bounce)
    el.style.transition = 'none';
    el.style.transform = 'none';

    // Apply final position
    const newX = vehicle.hz ? vehicle.x + cellsMoved : vehicle.x;
    const newY = vehicle.hz ? vehicle.y : vehicle.y + cellsMoved;
    el.style.top = `calc(100%/6 * ${newY} + ${HALF_GAP})`;
    el.style.left = `calc(100%/6 * ${newX} + ${HALF_GAP})`;

    // Force reflow before re-enabling transition
    el.offsetHeight;

    el.style.transition = 'top 0.2s ease, left 0.2s ease';
    el.style.zIndex = '5';

    // Report move
    if (cellsMoved !== 0) {
        onMoveEnd(state.vehicleIndex, cellsMoved);
    }

    state.active = false;
    state.vehicleIndex = -1;
    state.el = null;
}
