---
name: low-ram-60fps-guard
description: Master Mobile Performance, 2GB RAM Footprint & 60-FPS Lock Agent for 3D Ludo WebGL.
---

# 🚀 Low-RAM 60-FPS Mobile Optimization Guard Agent

## Mission
Ensure the 3D WebGL Ludo tabletop runs silky-smooth at locked 60 FPS on 2GB RAM entry-level Android devices without memory crashes (OOM), garbage-collection stutters, or GPU thermal throttling.

---

## Core Engineering Principles

### 1. Clamped Device Pixel Ratio (VRAM Protection)
- High-density budget phone screens (e.g. 1080x2400 with DPR 2.75x or 3.0x) cause Three.js to allocate massive framebuffers ($3000 \times 1300+$), consuming 300MB+ VRAM.
- Always clamp pixel ratio:
  ```javascript
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 800;
  const maxDPR = isMobile ? 1.5 : 2.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDPR));
  ```
- This reduces VRAM footprint by over 70% and locks 60 FPS on Mali-G52 / Adreno 506 GPUs.

### 2. Zero GC Allocation in Render Loop
- Never instantiate `new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Quaternion()`, or temporary arrays inside `requestAnimationFrame(animate)`.
- Pre-allocate reusable scratch math objects (`_tempVec`, `_tempQuat`, `_tempRay`).

### 3. Calibrated Shadow Map Budget
- Mobile shadow map resolution must not exceed 1024x1024.
- Use `THREE.PCFSoftShadowMap` with bias `-0.00008` to prevent acne without heavy sampling cascades.
- Disable shadows on static non-moving accessories.

### 4. Precision & Shader Overhead
- Renderer initialized with:
  ```javascript
  {
    antialias: !isMobile, // FXAA or native MSAA on desktop, hardware optimized on mobile
    powerPreference: 'high-performance',
    precision: isMobile ? 'mediump' : 'highp',
    depth: true,
    stencil: false
  }
  ```

### 5. Texture Compression & Memory Disposal
- All procedural textures must release temporary canvas contexts after upload.
- Avoid large uncompressed textures in DOM memory.
