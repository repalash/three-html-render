# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

### Added
- `HTMLTexture` — drop-in replacement for `THREE.HTMLTexture`; re-exports the native class on three.js ≥ 0.184, falls back to `captureElementImage` + standard texture upload on older three.js.
- `InteractionManager` — port of `three/addons/interaction/InteractionManager.js` that works with both the native `HTMLTexture` and the fallback.
- `RaycastInteractionManager` — single-element overlay that works on every face of a box and on curved surfaces (raycast UV → translate element under pointer).
- `InteractionManagerStandalone` — matrix3d overlay for raw WebGL / WebGPU / 2D apps (no three.js dependency).
- New package subpath exports for each helper above.
- Landing page (`index.html`) listing every demo with a hero preview of the dragon showcase.
- Demos: `three-html`, `three-html-raycast`, `three-html-webgpu`, `three-html-webgpu-raycast`, `three-html-legacy`, `three-dragon`.
- CSS pseudo-class rendering: `:hover`, `:focus`, `:active`, `:focus-visible`, `:focus-within` via class rewriting into the rasterized SVG.
- Baseline hover / active styles for native form controls (adapts to light/dark mode).
- Input caret rendering with blink animation, text-selection highlighting for `<input>` / `<textarea>`, page-level text-selection highlighting.
- Mirror-div measurement for accurate multi-line textarea caret positioning.
- Browser-extension coexistence: a page's own polyfill install cleanly supersedes the extension's.

### Changed
- Package: `three` removed from `devDependencies` (peer dep kept). Demos load three from CDN via `<script type="importmap">`. A `html-importmap-sync` Vite plugin mirrors the map at resolve time for `npm run dev`.
- `HtmlOverlayRendererStandalone` → `InteractionManagerStandalone` (file, class, export path all renamed).
- Bumped `@types/three` to `^0.184.0`.
- `npm run dev` now uses `vite.config.demo.ts` (serves the demo site on port 5173).

### Deprecated
- `ThreeHTMLRenderer` (export `./renderer`) — still compiled into `dist/` but no longer documented. Use `HTMLTexture` + `InteractionManager` (or `RaycastInteractionManager`) instead. Will be removed in a future minor.

### Removed
- `examples/c64/` demo.

### Fixed
- Texture flipY on the `texElementImage2D` upload path (was inheriting stray GL state).
- Global regex `lastIndex` bug in the pseudo-class rewriter.
- `selectionchange` listener leak on `document`.
- Missing `fontVariant` and `direction` in text measurement.
- `lineHeight` unitless value incorrectly treated as pixels.
- `focus-ring.html` script-order race (inline non-module script ran before the deferred polyfill-install module script).

## [0.1.0] - 2026-04-10

### Added
- HTML-in-Canvas polyfill (`installHtmlInCanvasPolyfill`).
- Three.js integration via `ThreeHTMLRenderer`.
- DOM-overlay positioning via a single `matrix3d` per element.
- Three-tier texture upload: `HTMLTexture` (latest three.js) › `texElementImage2D` (native Canary) › `captureElementImage` (polyfill).
- Automatic material assignment and `onpaint` / `requestPaint` wiring.
- Event-propagation isolation for OrbitControls compatibility.
- ESM + IIFE builds with TypeScript declarations.
- Examples: WebGL texture, multi-face cube, complex text, pie chart.
