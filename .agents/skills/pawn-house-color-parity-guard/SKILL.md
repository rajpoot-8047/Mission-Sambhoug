---
name: pawn-house-color-parity-guard
description: Pawn-House Color Parity & Exact Royal Gemstone Match Guard Agent for 3D Ludo. Enforces 100% visual and mathematical color parity between pawns (gotiyan) and board houses, yards, inner floors, pad boxes, and tracks.
---

# 🎨 Pawn-House Color Parity Guard Agent

## Mission
Guarantee that the board houses (quadrant perimeter walls, recessed yard floors, yard goti pad boxes, stepped tracks, and center pyramid facets) have **100% color parity and harmony with the gotiyan (pawns)** for all 4 players:
- **Red (Player 0)**: Deep Carnelian Agate (`#BA1D1D`), pad boxes `#BA1D1D`, inner yard bed `#5A0E0E` (zero salmon, pink, or bleached tones).
- **Yellow (Player 1)**: Radiant Baltic Amber Gold (`#D9B300`), pad boxes `#D9B300`, inner yard bed `#6E5900` (zero dull khaki or washed-out yellow).
- **Blue (Player 2)**: Deep Royal Lapis Lazuli (`#0C4BBD`), pad boxes `#0C4BBD`, inner yard bed `#072254` (zero baby-blue or cyan drift).
- **Charcoal (Player 3)**: Deep Obsidian Slate (`#2B3238`), pad boxes `#2B3238`, inner yard bed `#161C20` (zero light gray or washed-out slate).

## Root Cause Knowledge
- **Color Desynchronization**: Historically, inner yard floors used pastel tint hexes (e.g. `0xc98288` for Red, `0x88add1` for Blue), causing them to look washed-out, salmon-pink, or baby-blue.
- **Lighting Bleach on Flat Surfaces**: Excessive directional down-lighting (`keySpot` > 0.3) combined with Lambert materials creates a 1.4x+ diffuse multiplier on horizontal surfaces with normal `(0, 1, 0)`. Vertical pawn lathes receive grazing light and appear much darker, creating an artificial mismatch. Balanced studio ambient lighting (`0.72`) with moderated key spot (`0.22`) maintains identical perceived luminance across both geometries.
- **Pad-Pawn Unity**: The 4 square boxes in each yard are physical pedestals for the gotiyan; their base hex must match `PAWN_RED`, `PAWN_YELLOW`, `PAWN_BLUE`, and `PAWN_CHARCOAL` 1:1.

## Hard Rules
1. **Pad Box Identity**: `PAD_RED`, `PAD_YELLOW`, `PAD_BLUE`, `PAD_CHARCOAL` must mathematically equal `PAWN_RED` (`0xba1d1d`), `PAWN_YELLOW` (`0xd9b300`), `PAWN_BLUE` (`0x0c4bbd`), and `PAWN_CHARCOAL` (`0x2b3238`).
2. **Fortress Wall & Track Unity**: Outer walls, stepped track pathways, and center pyramid facets must use the exact royal player gemstone tokens (`PALETTE.RED`, `PALETTE.YELLOW`, `PALETTE.BLUE`, `PALETTE.CHARCOAL`).
3. **No Washed-Out Inner Floors**: `RED_INNER`, `YELLOW_INNER`, `BLUE_INNER`, and `CHARCOAL_INNER` must be deep royal satin tones that share the exact chromatic hue family of the gotiyan, with zero pastel, pink, or baby-blue components.
4. **Studio Lighting Balance**: Studio ambient lighting must provide the core diffuse baseline (`ambientLight` ~0.72) with directional spotlights kept moderate (`keySpot` ~0.22, `rimLight` ~0.12, `fillLight` ~0.10) to prevent top-surface bleaching.
5. **Automated Audit**: Enforced by `audit_pawn_house_color_parity()` in `.agents/verify_all_agents.py`.
