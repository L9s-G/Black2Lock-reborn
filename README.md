# Block2Lock

A classic sliding block puzzle game (华容道) built as a zero-build Progressive Web App.

## Overview

Slide blocks on a 6×6 grid to move the red player block to the exit. 352,273 levels across 22 packs, ranging from beginner to expert difficulty.

## Features

- **352,273 levels** — 401 classic levels + 351,872 DLC levels (moves 10–51)
- **DLC system** — 21 downloadable level packs, independently managed
- **Favorites** — mark levels with ♥, favorites always sort first
- **Offline play** — Service Worker caches game assets, DLC stored in IndexedDB
- **PWA** — installable on mobile and desktop
- **Dark/Light theme** — toggle via title "2" button
- **Undo & Replay** — full move history with replay animation
- **Random level** — pick from unplayed or all levels
- **Sort modes** — ascending/descending by completion moves
- **Base-62 level display** — compact 3-digit level names (0-9, a-z, A-Z)
- **Per-pack progress** — scores and move histories stored independently

## Architecture

```
index.html       UI markup
style.css        All styles (theme variables, responsive, animations)
main.js          Entry point, orchestration (~300 lines)
game.js          Pure game state and logic (no DOM, no storage)
render.js        All DOM manipulation, UI components (~400 lines)
drag.js          Mouse/touch drag interaction
store.js         IndexedDB persistence layer (meta, scores, histories, favorites, DLC bins)
data.js          Level data loading (on-demand slicing from Uint8Array)
sw.js            Service Worker for offline caching
lvl_base.bin     401 classic levels (14 KB)
dlc/             DLC packs (bin files + manifest + generation tool)
manifest.json    PWA manifest
```

## Level Data Format

Each level is a 36-character string (6×6 grid, row-major):
- `o` = empty cell
- `A` = player block (always index 0)
- `B`–`Z` = other blocks (named by first-appearance order)

Binary storage: 36 bytes per level (one byte per character, ASCII). Random access by `offset = levelIndex × 36`.

**On-demand slicing**: packs are stored as raw `Uint8Array` in memory. Level strings are converted from 36-byte slices only when accessed, keeping memory at 1× binary size.

## Storage Design

| Data | Engine | Structure |
|------|--------|-----------|
| Scores | IndexedDB | `[packId, levelIndex]` → `{moves}` |
| Move histories | IndexedDB | `[packId, levelIndex]` → `Uint8Array` (2 bytes/move) |
| Favorites | IndexedDB | `[packId, levelIndex]` → presence = favorited |
| Pack progress | IndexedDB | `packId` → `{currentLevel}` |
| DLC binaries | IndexedDB | `packId` → `ArrayBuffer` |
| Theme | localStorage | `light` / `dark` |

Move history encoding: each move = 2 bytes (`vehicleIndex: uint8`, `cellsMoved: int8`). A 20-move replay = 40 bytes.

## DLC System

Level packs are grouped by optimal solution moves:

| Pack | Moves | Levels | Size |
|------|-------|--------|------|
| Classic | — | 401 | 14 KB |
| DLC 10–29 | 10–29 | 586 – 58,327 | 21 KB – 2.1 MB |
| DLC 30+ | 30+ | 1,724 | 62 KB |

- Players download packs on demand
- Downloaded packs persist in IndexedDB for offline use
- Each pack has independent progress, scores, and favorites
- Binary validation: length must be a multiple of 36
- Corrupt packs are auto-detected and removed on startup

## Level Select

Two-layer UI:
1. **Pack list** — shows all available packs with download/enter status
2. **Level grid** — lazy-loaded (200 per batch), with action buttons

Sorting within a pack (three groups):
1. ♥ Favorites (by index asc/desc)
2. Completed levels (by score asc/desc, then by index)
3. Unplayed levels (by index asc/desc)

Level display uses base-62 encoding (0-9, a-z, A-Z), 3 digits for up to 238,327 levels per pack.

## Module Design

**Separation of concerns:**
- `game.js` — pure logic, no side effects, testable in isolation
- `render.js` — DOM only, receives data and renders it
- `store.js` — all IndexedDB operations centralized
- `data.js` — level loading with on-demand slicing
- `drag.js` — encapsulated drag interaction with callback
- `main.js` — orchestration layer wiring modules together

**Key decisions:**
- No build tools — native ES modules, zero configuration
- No framework — vanilla JS, ~60 KB total (excluding DLC)
- External CSS — `style.css` with CSS variables for theming
- Binary level format — 36 bytes/level, instant random access
- On-demand slicing — Uint8Array in memory, convert on access
- IndexedDB — supports large datasets (hundreds of MB)
- Pack-based architecture — levels identified by `{packId, levelIndex}`

## Quick Start

```bash
# Serve locally
npx serve .

# Or any static file server
python3 -m http.server 3000
```

Open `http://localhost:3000` in a browser.

## Deployment

Upload all files to a static hosting service. Ensure:
- `sw.js` is at the root (service worker scope)
- `style.css` is accessible (external stylesheet)
- `dlc/` directory is accessible (DLC downloads)
- HTTPS is enabled (required for PWA and service worker)

## License

Classic levels pay tribute to the original Rush Hour puzzle game.
