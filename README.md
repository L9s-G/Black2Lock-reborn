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
- **4 themes** — Dark, Light, Forest Mist, Amber Arc — toggle via title "2" button
- **Undo & Replay** — full move history with replay animation
- **Random level** — pick from unplayed or all levels
- **Sort modes** — ascending/descending by completion moves
- **Base-62 level display** — compact 3-digit level names (0-9, a-z, A-Z)
- **Per-pack progress** — scores and move histories stored independently

## Architecture

```
index.html       UI markup
themes.css       Theme color variables (dark, light, forest, amber)
style.css        Layout, components, animations (references theme variables)
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

## UI Design

### Styling Architecture

Styles split across two files:

- **`themes.css`** — theme color variables only (one block per theme, easy to extend)
- **`style.css`** — layout, components, animations (references theme variables)

`style.css` organized into 14 sections:

1. **Base Reset & Typography** — CSS reset, system font stack
3. **Page Layout** — `.page` (flex centering), `.page-width` (responsive max-width)
4. **Header & Game Info** — title, ghost buttons, action buttons
5. **Buttons & Controls** — `.btn`, `.action-btn`, `.btn-ghost`
6. **Game Board & Vehicles** — board grid, vehicle blocks, exit label
7. **Modals (shared)** — overlay, content, title, close button
8–11. **Modal variants** — win, random/delete, pack select, level select
12. **Animations** — `@keyframes` for win slide-out and modal fade-in
13. **Easter Egg** — hidden switch text (color-matching invisibility)
14. **Responsive Breakpoints** — 640/768/1024px
15. **Hover Styles** — `@media (hover: hover)` for non-touch devices

### Main Interface Layout

```
┌─────────────────────────────┐
│         Block2Lock          │  ← game-title
│                             │
│ Classic:001  Moves:5 Best:3 │  ← 3 ghost buttons (btn-ghost)
│                             │
│    ◀  Classic:001  Random ▶ │  ← 4 action buttons
│                             │
│  ┌───────────────────────┐  │
│  │        ♥              │  │  ← favorite-btn (absolute)
│  │  ┌──┬──┬──┬──┬──┬──┐  │  │
│  │  │  │  │  │  │  │  │  │  │  ← 6×6 board
│  │  ├──┼──┼──┼──┼──┼──┤  │  │
│  │  │  │  │  │  │  │  │  │  │
│  │  └──┴──┴──┴──┴──┴──┘  │  │
│  └───────────────────────┘  │
│                             │
│          [ Undo ]           │  ← btn-undo
└─────────────────────────────┘
```

**Ghost buttons** (`.btn-ghost`): transparent, no border/background, look like plain text. Used for Moves, Best, and level display. Disabled state is visually identical to enabled (cursor changes only).

**Action buttons** (`.action-btn`): styled with `--bg-button` background, subtle border and shadow in dark mode. Used for ◀, ▶, Random, and level display marquee.

### Level Display Marquee

The level display button uses a CSS breathing animation to crossfade between pack name and level number. A single `@keyframes breathe` with `animation-delay: -2.5s` offsets the two texts by half the 5-second cycle. Pauses on game win via `animationPlayState`.

### Favorite Button

Floating ♥ at the top-right corner of the game container (`position: absolute`, `z-index: 20`). Two states:
- Not favorited: `var(--text-secondary)` (muted gray)
- Favorited: `var(--color-player)` (theme accent red)

### Modal Hierarchy

| Modal | z-index | Screen padding | Purpose |
|-------|---------|----------------|---------|
| Win | 50 | — | Game completion |
| Pack select | 50 | 0.5rem | Choose DLC pack |
| Level select | 50 | 0.5rem | Choose level within pack |
| Random | 60 | 0.75rem | Random level picker |
| Delete | 60 | 0.75rem | Confirm pack deletion |

Higher z-index modals have more screen padding, expressing visual hierarchy.

### Theme System

50+ CSS custom properties on `body`, overridden on `body.light`:

| Category | Variables |
|----------|-----------|
| Core | `--bg-main`, `--text-primary`, `--text-secondary` |
| Container | `--bg-container`, `--border-container`, `--bg-board` |
| Buttons | `--bg-button`, `--bg-button-hover`, `--text-button`, `--border-button`, `--shadow-button` |
| Modals | `--bg-modal`, `--border-modal`, `--text-win`, `--bg-win-button` |
| Level grid | `--bg-level-item`, `--bg-level-item-hover`, `--text-level-item` |
| Vehicles | `--color-player`, `--color-block-a` through `--color-block-k` |

Toggle: `body.classList.toggle('light')`, persisted in `localStorage`.

### Animations

- **Win**: player block slides out (`translateX(500%)`) over 0.4s, then win modal fades in
- **Modal**: `scale(0.9)` → `scale(1)` with opacity fade, 0.3s
- **Marquee**: pack name ↔ level number breathing crossfade (5s cycle, CSS-only)
- **Theme**: background-color and color transition over 0.3s

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
- Semantic CSS — no utility framework, component-based class names
- Split CSS — themes.css (colors) + style.css (layout), easy to extend
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
