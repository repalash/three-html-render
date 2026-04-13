# three-html-render

Polyfill for the [WICG HTML-in-Canvas](https://github.com/WICG/html-in-canvas) proposal. Render live, interactive HTML as WebGL/WebGPU textures — works in all browsers today.

[![npm version](https://img.shields.io/npm/v/three-html-render)](https://www.npmjs.com/package/three-html-render)
[![bundle size](https://img.shields.io/badge/minzipped-9.5kB-blue)](https://bundlephobia.com/package/three-html-render)
[![license](https://img.shields.io/github/license/repalash/three-html-render)](./LICENSE)

[![Part of threepipe](https://img.shields.io/badge/part%20of-threepipe-blue)](https://github.com/repalash/threepipe)
[![Part of kite3d](https://img.shields.io/badge/part%20of-kite3d-blue)](https://kite3d.dev)

## Features

- **HTML-in-Canvas polyfill** — brings the spec to all browsers (Safari, Firefox, iOS, Android), not just Chrome Canary
- **CSS pseudo-classes** — `:hover`, `:focus`, `:active`, `:focus-visible`, `:focus-within` render correctly on 3D surfaces
- **CSS animations** — spinners, transitions, keyframes render live
- **Scrolling** — scrollable HTML content inside textures
- **Interaction** — click buttons, type in inputs, follow links, select text on 3D meshes
- **Caret & text selection** — input/textarea caret and selection highlighting rendered in the texture
- **Page-level text selection** — select text across HTML elements, highlight rendered in texture
- **Native fast-path** — uses `texElementImage2D` when available (Chrome Canary), falls back to SVG foreignObject polyfill
- **Three.js integration** — automatic texture upload, DOM overlay positioning, material assignment
- **Latest Three.js support** — auto-detects `HTMLTexture` class when available
- **Browser extension** — Chrome & Safari extensions to polyfill any page

## Examples

| Example                                                 | Demo                                                                                   | Description                                                           |
|---------------------------------------------------------|----------------------------------------------------------------------------------------|-----------------------------------------------------------------------|
| [index.html](index.html)                                | [Live](https://repalash.com/three-html-render/)                                        | Dragon model with scrollable HTML, hover effects, forms, theme toggle |
| [text-input](examples/text-input.html)                  | [Live](https://repalash.com/three-html-render/examples/text-input.html)                | Interactive form with caret & selection                               |
| [webGL-text-input](examples/webGL-text-input.html)      | [Live](https://repalash.com/three-html-render/examples/webGL-text-input.html)          | Multi-face cube with interactive forms                                |
| [webGL](examples/webGL.html)                            | [Live](https://repalash.com/three-html-render/examples/webGL.html)                     | Basic WebGL texture from HTML                                         |
| [complex-text](examples/complex-text.html)              | [Live](https://repalash.com/three-html-render/examples/complex-text.html)              | Rich text rendering                                                   |
| [pie-chart](examples/pie-chart.html)                    | [Live](https://repalash.com/three-html-render/examples/pie-chart.html)                 | SVG/HTML chart on 3D surface                                          |
| [jelly-slider](examples/webgpu-jelly-slider/index.html) | [Live](https://repalash.com/three-html-render/examples/webgpu-jelly-slider/index.html) | WebGPU slider with `copyElementImageToTexture` (requires WebGPU)      |
| [focus-ring](examples/focus-ring.html)                  | [Live](https://repalash.com/three-html-render/examples/focus-ring.html)                | WebGL focus glow shader with interactive form                         |
| [webxr-vr](examples/webxr-vr.html)                     | [Live](https://repalash.com/three-html-render/examples/webxr-vr.html)                  | VR floating dashboards with glass panels (requires WebXR)             |
| [webxr-ar](examples/webxr-ar.html)                     | [Live](https://repalash.com/three-html-render/examples/webxr-ar.html)                  | AR panel placed on real-world surface (requires ARCore)               |

## Install

### Polyfill

Add to page and use the html-in-canvas API normally

```html
<script src="https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.js"></script>
```

### NPM

```bash
npm install three-html-render
```

## Usage

How to render HTML inside canvas - 2d, webgl, webgpu context

### Polyfill only (no Three.js)

Now any `<canvas layoutsubtree>` element supports the full API:

```html
<canvas id="c" layoutsubtree>
  <div id="content" style="width:400px;height:300px">
    <h1>Hello from HTML</h1>
    <button>Click me</button>
  </div>
</canvas>
<script type="importmap">
    { "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three-html-render/polyfill": "https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.mjs"
    }}
</script>
<script type="module">
  import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill'
  installHtmlInCanvasPolyfill()

  const canvas = document.getElementById('c')
  const content = document.getElementById('content')
  const ctx = canvas.getContext('2d')

  canvas.onpaint = () => {
    ctx.drawElementImage(content, 0, 0)
  }
  canvas.requestPaint()
</script>
```

### With Three.js

```html
<canvas id="canvas" layoutsubtree>
  <div id="htmlContent" style="width:512px;height:512px;padding:20px;background:white;font-size:24px;">
    <h1>Hello from HTML</h1>
    <button onclick="this.textContent='Clicked!'">Click me</button>
    <input type="text" value="Type here" style="font-size:20px;padding:4px;">
  </div>
</canvas>

<script type="importmap">
{ "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
    "three-html-render/polyfill": "https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.mjs",
    "three-html-render/renderer": "https://cdn.jsdelivr.net/npm/three-html-render/dist/renderer.js"
}}
</script>
<script type="module">
  import * as THREE from 'three'
  import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill'
  import { ThreeHTMLRenderer } from 'three-html-render/renderer'

  installHtmlInCanvasPolyfill()

  const canvas = document.getElementById('canvas')
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 100)
  camera.position.z = 2
  const threeRenderer = new THREE.WebGLRenderer({ canvas })
  threeRenderer.setSize(innerWidth, innerHeight)

  const geometry = new THREE.PlaneGeometry(2, 2)
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const htmlRenderer = new ThreeHTMLRenderer()
  htmlRenderer.connect(canvas, camera, threeRenderer)
  htmlRenderer.addObject(document.getElementById('htmlContent'), mesh)

  function animate() {
    requestAnimationFrame(animate)
    htmlRenderer.update()
    threeRenderer.render(scene, camera)
  }
  animate()
</script>
```

The HTML element should be a child of a `<canvas layoutsubtree>`. The renderer handles texture upload, DOM overlay positioning, event propagation, and material assignment automatically. Works with Three.js >= 0.150.0.

## What Gets Polyfilled

The polyfill implements the full [WICG HTML-in-Canvas](https://github.com/WICG/html-in-canvas) API surface:

| API                                           | Target                     | Description                                                                                                                    |
|-----------------------------------------------|----------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `layoutsubtree`                               | `HTMLCanvasElement`        | Attribute that opts canvas children into layout                                                                                |
| `onpaint`                                     | `HTMLCanvasElement`        | Event fired when children need re-rendering                                                                                    |
| `requestPaint()`                              | `HTMLCanvasElement`        | Request a paint event on the next frame                                                                                        |
| `captureElementImage()`                       | `HTMLCanvasElement`        | Capture a child element's rendered snapshot                                                                                    |
| `getElementTransform(element, drawTransform)` | `HTMLCanvasElement`        | Get CSS transform to align DOM overlay with drawn position. `drawTransform` is the `DOMMatrix` returned by `drawElementImage`. |
| `drawElementImage()`                          | `CanvasRenderingContext2D` | Draw a child element onto the 2D canvas. Returns a `DOMMatrix`.                                                                |
| `texElementImage2D()`                         | `WebGLRenderingContext`    | Upload a child element as a WebGL texture                                                                                      |
| `copyElementImageToTexture()`                 | `GPUQueue`                 | Upload a child element as a WebGPU texture                                                                                     |

## API

### `installHtmlInCanvasPolyfill(options?)`

Installs the polyfill on all `<canvas layoutsubtree>` elements.

| Option       | Type      | Default | Description                                                                                |
|--------------|-----------|---------|--------------------------------------------------------------------------------------------|
| `force`      | `boolean` | `false` | Install even if native API is available. Also activates when `?polyfillHIC` is in the URL. |
| `pageStyles` | `string`  | —       | Additional CSS to include in renders                                                       |

### `uninstallHtmlInCanvasPolyfill()`

Cleanly removes the polyfill, restoring all patched prototypes and tearing down canvas states.

### `getHtmlRenderer()`

Returns the internal `HtmlRenderer` instance used by the polyfill. Useful for advanced operations like invalidating cached styles:

```js
import { getHtmlRenderer } from 'three-html-render/polyfill'
getHtmlRenderer().invalidatePageStylesCss()
```

### `ThreeHTMLRenderer`

Connects HTML elements to Three.js meshes for texture rendering and DOM overlay interaction.

#### Methods

| Method                              | Description                                                           |
|-------------------------------------|-----------------------------------------------------------------------|
| `connect(canvas, camera, renderer)` | Bind to a Three.js canvas, camera, and WebGL renderer                 |
| `addObject(element, mesh)`          | Register an HTML element to render onto a mesh                        |
| `update()`                          | Call every frame — positions DOM overlay and triggers texture updates |
| `getTexture(element)`               | Get the Three.js `Texture` for a given element                        |

#### Properties

| Property           | Type                  | Default | Description                               |
|--------------------|-----------------------|---------|-------------------------------------------|
| `selectionOpacity` | `number`              | `0`     | DOM overlay opacity when text is selected |
| `overlayRenderer`  | `HtmlOverlayRenderer` | —       | The underlying overlay positioning engine |

### Texture Upload Strategy

`ThreeHTMLRenderer` automatically picks the best upload path:

1. **Latest Three.js** (`HTMLTexture` available) — renderer handles everything
2. **Native Canary** (`texElementImage2D` on GL context) — direct GL upload
3. **Polyfill** — `captureElementImage` → canvas → `texture.image`

## How It Works

1. The polyfill moves `<canvas>` children into an offscreen host div, rasterizes them via SVG foreignObject → `<img>` → canvas
2. CSS pseudo-classes (`:hover`, `:focus`, `:active`, etc.) are rewritten to real CSS classes (`.pseudo-hover`, `.pseudo-focus`, `.pseudo-active`) and injected into the SVG stylesheet. Mouse/focus/pointer events toggle these classes on the host overlay.
3. Input caret and text selection are measured from the live DOM and injected as positioned `<div>` elements into the SVG clone
4. `onpaint` / `requestPaint` API lets consumers control when rasterization happens
5. `ThreeHTMLRenderer` positions a transparent DOM overlay (using `matrix3d` math) so the browser handles hit-testing natively
6. Texture is uploaded to WebGL/WebGPU each frame via the best available path

Run `npm run dev` to start the dev server locally.

## Browser Support

| Browser                | Support           | Method                                                |
|------------------------|-------------------|-------------------------------------------------------|
| Chrome, Edge           | Full              | Polyfill (SVG foreignObject)                          |
| Safari, iOS Safari     | Full              | Polyfill                                              |
| Firefox                | Full              | Polyfill                                              |
| Android Chrome/WebView | Full              | Polyfill                                              |
| Chrome Canary          | Native + Polyfill | Native via `chrome://flags/#canvas-draw-element` flag |

The HTML-in-Canvas API is a [WICG proposal](https://github.com/WICG/html-in-canvas) currently in developer trial in Chrome Canary, with an origin trial planned for Chrome M148-M151. The polyfill ensures your code works today and will automatically use the native fast-path when browsers ship support.

## Known Limitations

- Textarea internal scroll is not reflected in the texture (content renders at scroll position 0)
- `contenteditable` elements don't support caret/selection rendering
- Dynamic stylesheets added after polyfill installation need `getHtmlRenderer().invalidatePageStylesCss()` to pick up new pseudo-class rules
- `:visited` pseudo-class cannot be polyfilled (browser privacy restriction)
- Some CSS features may render differently in SVG foreignObject context (e.g., form control appearance, `color-scheme`)

## Integration

This library works with vanilla Three.js (>= 0.150.0). The functionality is also built into [threepipe](https://threepipe.org) ([GitHub](https://github.com/repalash/threepipe)) and [kite3d](https://kite3d.dev) as plugins — manual code integration is not required when using those frameworks.

If you are using React Three Fiber or another Three.js framework, refer to their documentation for integration guidance.

## Browser Extension

Chrome and Safari extensions are included to polyfill any page. See [extension/README.md](./extension/README.md) for build and installation instructions.

## Development

```bash
npm run dev              # Start Vite dev server
npm run build            # Build library (ESM + IIFE + .d.ts)
npm run build:demo       # Build demo site (for GitHub Pages)
npm run build:extension  # Build browser extension
npm run typecheck        # Run TypeScript type checking
```

## License

[MIT](./LICENSE)

## Contributing

Contributions welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.
