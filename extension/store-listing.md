# Chrome Web Store Listing

## Name
HTML-in-Canvas Polyfill

## Short description (≤132 chars)
Enables the experimental HTML-in-Canvas API so WebGL/WebGPU apps can render live HTML elements as textures.

## Category
Developer Tools

## Detailed description

**For web developers building WebGL or WebGPU applications.**

This extension polyfills the experimental Chrome HTML-in-Canvas API on any
Chromium browser, letting developers use the following APIs even before
native support ships:

- `canvas[layoutsubtree]` — declare a canvas whose HTML children can be rasterized
- `canvas.requestPaint()` / `canvas.onpaint` — request and react to paint cycles
- `CanvasRenderingContext2D.drawElementImage(el, x, y)` — draw an HTML element into a 2D canvas
- `WebGLRenderingContext.texElementImage2D(...)` — upload an HTML element as a WebGL texture
- `GPUQueue.copyElementImageToTexture(...)` — upload an HTML element as a WebGPU texture
- `canvas.getElementTransform(...)` / `canvas.captureElementImage(...)` — helpers

### What you will see

On pages that use these APIs, HTML elements (forms, styled text, images, even
interactive widgets) are rasterized into SVG `foreignObject` snapshots and
drawn into the canvas as textures every frame. On pages that don't use the
API, the extension does nothing — it only activates when a canvas has the
`layoutsubtree` attribute.

### Live demo

Open the demo with the extension enabled:

**https://repalash.com/three-html-render/?polyfillHIC**

You should see a scrollable, interactive HTML page rendered live as a
WebGL texture on a 3D mesh. Open DevTools and look for:

```
[html-in-canvas] Polyfill installed
```

### When the polyfill activates

- **Pages without the native API** — installs automatically
- **Pages with the native API (Chrome Canary with the flag)** — skipped
- **Force on any page** — append `?polyfillHIC` to the URL

### Permissions

- `content_scripts` at `document_start` in the main world — needed to patch
  `HTMLCanvasElement.prototype`, `CanvasRenderingContext2D.prototype`,
  `WebGLRenderingContext.prototype`, and `GPUQueue.prototype` before any page
  script runs.
- No network, storage, tabs, or user-data access.

### Source code

Open source at https://github.com/repalash/three-html-render

---

## Screenshots checklist

The reviewer rejected the previous submission because uploaded media did not
demonstrate observable functionality. Replace all screenshots before
resubmission. Each screenshot should include a caption at the top of the
image so the reviewer understands what they are looking at.

Required screenshots (1280×800 or 640×400):

1. **Demo page — HTML rendered as a WebGL texture**
   Caption: *"Live HTML page rendered as a WebGL texture on a 3D mesh."*
   Show the demo with the interactive page visible on the 3D canvas.
   Include a visible cursor hovering a button to show interactivity.

2. **DevTools console — polyfill active**
   Caption: *"Extension active: `[html-in-canvas] Polyfill installed`."*
   Screenshot the console showing the install log. Proves the extension is
   running.

3. **Before / after comparison**
   Caption: *"Left: without the extension (canvas fallback). Right: with the
   extension (HTML rendered as texture)."*
   Side-by-side of the same page with and without the extension.

4. **Rotated / 3D perspective shot**
   Caption: *"HTML elements rendered with a 3D transform — only possible via
   WebGL textures."*
   Emphasize that this is not just a CSS overlay.

5. **API reference / documentation shot** (optional)
   Caption: *"Polyfills `drawElementImage`, `texElementImage2D`,
   `copyElementImageToTexture`, `onpaint`, and `requestPaint`."*
   A simple slide listing the patched APIs.

---

## Appeal text (if resubmission is re-rejected)

> This extension polyfills an experimental Chromium API (HTML-in-Canvas) that
> currently ships only in Chrome Canary behind a flag. It is a developer tool
> aimed at web developers building WebGL/WebGPU applications that need to
> render live HTML content as a canvas texture.
>
> The rejection cited irrelevant media. We have replaced all screenshots with
> annotated captures of our live demo page
> (https://repalash.com/three-html-render/?polyfillHIC) showing:
>
> 1. An interactive HTML document being rendered as a WebGL texture on a 3D
>    mesh, with the extension enabled.
> 2. The DevTools console showing `[html-in-canvas] Polyfill installed`,
>    confirming the extension is active.
> 3. A before/after comparison demonstrating the visible difference the
>    extension makes on the demo page.
>
> The extension has no UI surface of its own — it is a content script that
> patches canvas-related prototypes at `document_start` so that pages using
> the experimental API work in non-Canary browsers. We have updated the
> description to make this clearer and added a demo URL the reviewer can
> open to verify functionality in seconds.
>
> No data is collected, stored, or transmitted. The extension requests no
> permissions beyond a `content_scripts` entry.
