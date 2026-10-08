---
name: unity-ludo-engine
description: Pure Headless C# Game Rules Engine, 1-Die & 2-Dice Variants, AI Bot & Spatial Coordinates Agent for Unity Ludo.
---

# 🧠 Unity Ludo Game Engine Agent

## Engine Architecture

### 1. Pure Headless C# Isolation
- `LudoGameEngine.cs`, `BoardData.cs`, and `AiBot.cs` must remain completely decoupled from Unity engine objects (`GameObject`, `Transform`, `MonoBehaviour`).
- Uses standard C# classes, structs, and interfaces so game simulation can execute in headless unit tests with 0 milliseconds render latency.

### 2. Dual Gameplay Modes
- **1-Die Classic:** Rule of 6 to release from yard, bonus roll on 6 or capture, exact home finish.
- **2-Dice Speed Ludo:** Interactive dice selection (Die 1 vs Die 2), allowing players to allocate numbers across two distinct gotiyan or combine on a single goti, doubles bonus rolls, and 3-doubles turn forfeit penalties.

### 3. Spatial Alignment & Radial Anti-Overlap
- Calculates pawn world positions mathematically from grid coordinates (0 to 14 in X and Z).
- Implements radial multi-pawn clustering on shared tiles to guarantee zero mesh clipping.
