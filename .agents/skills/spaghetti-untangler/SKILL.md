---
name: spaghetti-untangler
description: Spaghetti code untangler and architectural refactoring agent for Flutter & Dart. Enforces strict modularity, files under 250 lines, and decoupled presentation/engine.
---

# Spaghetti Code Untangler Agent

## Core Architecture Rules
1. **Headless Engine Decoupling:** Game rules (`LudoRulesEngine`), board geometry (`BoardGeometry`), and AI (`LudoAiBot`) must NEVER import Flutter UI elements.
2. **File Size Guard:** Every file must remain under 250 lines. Decompose complex widgets into focused sub-components.
3. **Zero Circular Dependencies:** Unidirectional imports only:
   - `models` <- `engine` <- `ui` / `rendering`
4. **Clean Parameterization:** Explicit return types, immutable data models where applicable.
