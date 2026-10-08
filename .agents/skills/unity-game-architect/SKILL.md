---
name: unity-game-architect
description: Master Unity 3D Architecture, C# Scripting, Project Hierarchy & Cross-Platform (WebGL, PC, Mobile) Agent for Free-of-Cost Heirloom Ludo.
---

# 🏛️ Unity 3D Game Architect Agent

## Core Architectural Directives

### 1. Zero-Cost Engine & Dependency Boundary
- Enforce Unity Personal Edition ($0 license cost).
- Zero third-party paid asset dependencies. All 3D geometry, textures, audio waveforms, and fonts must be procedurally generated via standard C# and built-in Unity modules (`UnityEngine`, `UnityEngine.UI`, `UnityEngine.Rendering.Universal`).

### 2. Clean Modular Hierarchy
- Maintain single responsibility per C# script (< 250 lines per file).
- Pure logic rules (`LudoGameEngine.cs`, `BoardData.cs`, `AiBot.cs`) must have zero dependencies on `MonoBehaviour` or `GameObject` so they can run headlessly and be unit-tested without scene loading.
- Presentation layers (`PawnController.cs`, `DicePhysicsController.cs`, `UIManager.cs`) interact with the engine strictly through clean event callbacks and explicit data models.

### 3. Cross-Platform Compilation Readiness
- Architecture must support 1-click builds for:
  - **WebGL:** Optimized for in-browser desktop and mobile play with WebAssembly.
  - **Windows Standalone (.exe):** High-fidelity desktop resolution with full anti-aliasing.
  - **Mobile (Android/iOS):** Touch-responsive raycasting and responsive canvas scaling.
