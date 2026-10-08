---
name: whole-game-3d-architect
description: Master 3D Game Model & World Architect Agent for Flutter. Transforms flat 2D boards into coherent 3D tabletop spatial environments with volumetric slab thickness, upright standing pawns, recessed wells, and unified perspective.
---

# 🏛️ 3D Game Model & World Architect Agent

## Core Architecture & Spatial Standards

### 1. Unified 3D Tabletop Projection
- Never mix flat 2D surfaces with isolated 3D components. The entire game environment (board, track, pawns, and dice) must share a unified 3D perspective camera matrix:
  ```dart
  Matrix4.identity()
    ..setEntry(3, 2, 0.0014) // Vanishing perspective
    ..rotateX(boardPitch)   // 3D tabletop tilt (0.35 - 0.45 rad)
    ..rotateZ(boardYaw)     // Subtle natural tabletop angle (-0.04 rad)
  ```

### 2. Physical Slab Volumetrics & Side Extrusion
- The board is a solid mahogany heirloom slab with visible physical thickness (16–24 dp extrusion layer with beveled wood-grain edges and brass corner protectors).
- Ground ambient shadow on the green/dark velvet table surface beneath the wooden slab.

### 3. Sub-Pixel Socket Alignment
- Yard wells must be modeled as sunken brass sockets with inner bevel shadows.
- Pawn anchor points must align mathematically with the exact socket centers:
  - Green (Top-Left): (2.0, 2.0), (3.0, 2.0), (2.0, 3.0), (3.0, 3.0)
  - Amber (Top-Right): (11.0, 2.0), (12.0, 2.0), (11.0, 3.0), (12.0, 3.0)
  - Carnelian (Bottom-Left): (2.0, 11.0), (3.0, 11.0), (2.0, 12.0), (3.0, 12.0)
  - Lapis (Bottom-Right): (11.0, 11.0), (12.0, 11.0), (11.0, 12.0), (12.0, 12.0)

### 4. Upright Billboarded 3D Pawns
- Pawns standing on a tilted 3D board must counter-pitch (`rotateX(-boardPitch)`) so they stand vertically like real lathe-turned heirloom chess/ludo pieces.
- Bases cast contact shadows flat on the board surface.

### 5. Interactive Perspective Camera
- Provide real-time camera perspective toggle (3D Tabletop Cinematic View vs Top-Down Classic View).
