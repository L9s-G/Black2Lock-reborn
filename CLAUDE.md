# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Block2Lock is a zero-build Progressive Web App — a classic sliding block puzzle game (华容道/Rush Hour variant). It uses vanilla JS with ES modules, no build tools or frameworks. ~60 KB total excluding DLC data.

Serve locally with `npx serve .` or `python3 -m http.server 3000`.

## Architecture

**Module structure** (all ES modules, loaded via `<script type="module" src="./main.js">`):

- **`main.js`** — Entry point / orchestration. Wires all modules together, handles lifecycle (init, level transitions, DLC download/delete, theme toggle, win/undo/replay flows)
- **`game.js`** — Pure game logic (no DOM, no storage). Runtime state: vehicles, moves, move history, win check
- **`render.js`** — All DOM manipulation. Board rendering, modals (pack select, level select, random, delete, win), UI updates, lazy level grid loading
- **`drag.js`** — Encapsulated mouse/touch drag with collision-bound movement
- **`store.js`** — IndexedDB persistence layer (5 stores: meta, scores, histories, favorites, dlcBins)
- **`data.js`** — Level data loading with on-demand binary slicing from `Uint8Array`

**Static assets:**
- `index.html` — Single-page UI with 5 modals
- `themes.css` — Theme color variables (6 themes: dark, light, forest, amber, frost, softpink)
- `style.css` — Layout, components, animations
- `sw.js` — Service Worker (cache-first for offline)
- `manifest.json` — PWA manifest
- `lvl_base.bin` — 401 classic levels (14 KB)
- `dlc/*.bin` — 21 downloadable DLC level packs

## Key Design Decisions

- **Level format**: 36-char string per level (6x6 grid, row-major), stored as raw ASCII bytes (36 bytes/level). Characters: `o`=empty, `A`=player, `B`–`Z`=other blocks by first-appearance order.
- **On-demand slicing**: DLC packs loaded as `Uint8Array` in memory, level strings converted only when accessed. Memory = 1x binary size.
- **Move history encoding**: 2 bytes per move (`vehicleIndex: uint8`, `cellsMoved: int8`). A 20-move replay = 40 bytes.
- **Pack-based architecture**: Levels identified by `{packId, levelIndex}`. Packs: `base` (401 levels) + 21 DLC packs grouped by optimal solution moves (10–51).
- **Storage**: IndexedDB (`Block2LockDB`, version 3) with 5 object stores. Theme persisted in `localStorage`.
- **No build tools**: Native ES modules, semantic CSS, vanilla JS.

## Modals (z-index hierarchy)

| Modal | z-index | Padding |
|-------|---------|---------|
| Win | 50 | — |
| Pack select | 50 | 0.5rem |
| Level select | 50 | 0.5rem |
| Random | 60 | 0.75rem |
| Delete | 60 | 0.75rem |

## Common Tasks

### Adding a new theme
1. Add CSS custom properties block in [themes.css](themes.css) with the new body class (e.g., `body.frost { ... }`)
2. Add the theme name to the `THEMES` array in [main.js:23](main.js)
3. Update `applyTheme()` in [render.js:96](render.js) if the class naming differs from the theme name

### Adding a new DLC pack
1. Place the `.bin` file in the `dlc/` directory
2. Add an entry to [dlc/dlc.json](dlc/dlc.json) with id, name, moves, count, size, and file fields
3. Level count = file size / 36

### Changing the game board size
The grid is hardcoded as 6x6 throughout the codebase: `COLS = 6` in [data.js:11](data.js), `LEVEL_SIZE = 36` in [data.js:10](data.js), collision grid `new Uint8Array(36)` in [drag.js:54](drag.js), and CSS uses `100%/6` calculations in [render.js](render.js).

## Storage Schema (IndexedDB)

| Store | Key | Value |
|-------|-----|-------|
| `meta` | `packId` | `{ currentLevel }` |
| `scores` | `[packId, levelIndex]` | `{ packId, levelIndex, moves }` |
| `histories` | `[packId, levelIndex]` | `{ packId, levelIndex, data: Uint8Array }` |
| `favorites` | `[packId, levelIndex]` | `{ packId, levelIndex }` |
| `dlcBins` | `packId` | `ArrayBuffer` |
