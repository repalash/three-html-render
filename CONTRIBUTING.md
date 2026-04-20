# Contributing

Thanks for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/repalash/three-html-render.git
cd three-html-render
npm install
npm run dev
```

Open <http://localhost:5173> — you'll land on the examples index.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server (uses `vite.config.demo.ts`). |
| `npm run build` | Library build — ESM + IIFE + `.d.ts` (runs the extension build too). |
| `npm run build:demo` | Build the demo site into `dist-demo/` (what GitHub Pages serves). |
| `npm run build:extension` | Build the browser extensions into `extension/chrome/` and `extension/safari/`. |
| `npm run typecheck` | TypeScript check, no emit. |

## Project layout

```
src/
  htmlInCanvasPolyfill.ts      - polyfill entry (requestPaint, onpaint, texElementImage2D, …)
  htmlRenderer.ts              - internal SVG-foreignObject rasterizer
  htmlTexture.ts               - HTMLTexture (native re-export or fallback)
  interactionManager.ts        - upstream-parity InteractionManager port
  raycastInteractionManager.ts - single-element raycast overlay
  interactionManagerStandalone.ts - matrix3d overlay with no three.js dep
  syncFormState.ts             - small helper used by a couple of demos
  extensionEntry.ts            - browser-extension entry
examples/                      - every demo on the landing page
extension/                     - browser-extension sources (Chrome + Safari)
```

`three` is **not** in `devDependencies`. Dev, build, and the browser all load it from a CDN via a `<script type="importmap">` in each demo HTML. The `html-importmap-sync` plugin in `vite.config.demo.ts` mirrors those mappings at Vite's resolver so bare `import … from 'three'` works under the dev server too. If you add a new demo that uses three, give it its own importmap block — the plugin picks it up at startup.

## Pull Requests

1. Fork and branch from `master`
2. Make your changes
3. Run `npm run typecheck && npm run build` to verify
4. Open a PR with a clear description of the change

## Reporting Bugs

Open an issue with:
- What you expected vs what happened
- Steps to reproduce
- Browser and Three.js version

## Code Style

- TypeScript, no semicolons (except where ASI is ambiguous)
- No unnecessary comments — code should be self-explanatory
- Keep math comments for reference formulas
