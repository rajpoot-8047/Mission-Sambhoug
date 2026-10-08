---
name: unity-tabletop-vfx
description: Master URP Lighting, PBR Materials, Post-Processing Stack & Procedural Audio Synthesizer Agent for Unity Ludo.
---

# 💎 Unity Tabletop VFX & Audio Agent

## Visual & Audio Directives

### 1. Calibrated Museum PBR Materials
- Replicate the Bilal Khan museum render color tokens using URP Lit shaders:
  - Carnelian Agate (Red): `#BA1D1D`, Smoothness `0.88`, Metallic `0.10`
  - Baltic Amber (Yellow): `#D9B300`, Smoothness `0.85`, Metallic `0.20`
  - Royal Lapis Lazuli (Blue): `#0C4BBD`, Smoothness `0.90`, Metallic `0.15`
  - Obsidian Slate (Charcoal): `#2B3238`, Smoothness `0.80`, Metallic `0.05`
  - Inlaid Brass Gold: `#D4AF37`, Metallic `0.92`, Smoothness `0.86`
  - Mahogany Table Slab: `#14181B`, Smoothness `0.65`, Metallic `0.02`

### 2. Studio Lighting & Post-Processing
- Key Spot Light: Warm 3200K, intensity `1.2`, soft shadows (`PCF 4x4`).
- Fill Rim Light: Cool 6500K directional, intensity `0.45` for crisp silhouette separation.
- URP Volume Profile:
  - ACES Tonemapping
  - Bloom (Threshold: `1.05`, Intensity: `0.35`)
  - Subtle Vignette (Intensity: `0.22`, Smoothness: `0.4`)

### 3. $0 Procedural Audio Synthesizer
- Zero audio asset downloads needed. Create pure audio procedural clips at runtime via `AudioClip.Create`:
  - Dice clatter: Multi-frequency high-pass white noise impulses with exponential decay.
  - Pawn step: 180Hz sine thump with rapid envelope decay.
  - Knockout / Capture: Dual-tone dissonant metallic impact sweep.
  - Safe star / Victory: Ascending pentatonic chord chime.
