# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- CSS pseudo-class support: `:hover`, `:focus`, `:active`, `:focus-visible`, `:focus-within` rendered in textures via class rewriting
- Baseline hover/active styles for native form controls (brightness filter, adapts to light/dark mode)
- Baseline focus-visible outline for keyboard navigation
- Input caret rendering with blink animation
- Text selection highlighting for input and textarea elements
- Page-level text selection highlighting
- Mirror div measurement for accurate multi-line textarea caret positioning
- Browser extension co-existence: page script cleanly replaces extension polyfill

### Fixed
- Global regex `lastIndex` bug in pseudo-class rewriter
- `selectionchange` listener leak on document (now tracked and cleaned up)
- Missing `fontVariant` and `direction` in text measurement
- `lineHeight` unitless value incorrectly treated as pixels

## [0.1.0] - 2026-04-10

### Added
- HTML-in-Canvas polyfill (`installHtmlInCanvasPolyfill`)
- Three.js integration (`ThreeHTMLRenderer`)
- InteractionManager-style DOM overlay positioning (single `matrix3d` per element)
- Three-tier texture upload: `HTMLTexture` (latest Three.js) > `texElementImage2D` (native Canary) > `captureElementImage` (polyfill)
- Automatic material assignment and `onpaint`/`requestPaint` wiring
- Event propagation isolation for OrbitControls compatibility
- ESM + CJS dual builds with TypeScript declarations
- Examples: WebGL texture, multi-face cube, complex text, pie chart
