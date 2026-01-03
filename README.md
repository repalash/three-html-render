# Three.js HTML Render

Render interactive HTML content onto 3D objects in Three.js with full CSS support, animations, and user interactions.

[![Demo](https://img.shields.io/badge/Three.js-HTML%20to%20Texture-blue)](https://github.com/user/three-html-render)
[![GitHub Pages](https://img.shields.io/badge/demo-live-green)](https://user.github.io/three-html-render/)

## Features

- 🎨 **HTML to Texture** - Render any HTML/CSS content as a texture on 3D meshes
- 🎬 **CSS Animations** - Full support for CSS animations and keyframes
- 📜 **Scrolling Support** - Handle scrollable content within textures
- 🖱️ **Interactive Elements** - Clickable buttons, links, and other HTML elements
- 📝 **Text Selection** - Select and copy text from 3D surfaces
- ⚡ **Real-time Updates** - Dynamic content updates reflected on 3D objects

## Integration

This is an implementation for vanilla three.js projects. Check out the documented source code to see how it works and copy any relevant code.

The functionality is already built into [threepipe](https://threepipe.org) and [kite3d](https://kite3d.dev) using plugins. Manual code integration is not required when using those frameworks.

If you are using React Three Fiber or any other framework, it needs to be ported separately, check documentation of those frameworks for guidance.

## How It Works

The library uses a combination of:

1. **CSS3DRenderer** - Positions invisible HTML overlays aligned with 3D meshes for interaction
2. **HTML to SVG Conversion** - Converts HTML content to SVG using `foreignObject`
3. **Canvas Texture** - Renders the SVG to a canvas and creates a Three.js texture

This approach allows for:
- True CSS styling and animations
- Interactive HTML elements (buttons, links, forms)
- Text selection on 3D surfaces
- Scrollable content areas

## Installation

```bash
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Quick Start

```javascript
import { ThreeHtmlFiber } from './src/threeHtmlFiber.ts'

// Create the HTML renderer attached to a container
const threeHtmlFiber = new ThreeHtmlFiber(document.getElementById('container'))

// Optionally set page styles for consistent rendering
threeHtmlFiber.htmlRenderer.setPageStyles(yourCSSStyles)

// Add an object to render HTML onto
const cssObject = threeHtmlFiber.addObject(yourThreeMesh)
cssObject.element.innerHTML = '<div>Your HTML content here</div>'
cssObject.element.style.width = '1024px'

// In your animation loop
function animate() {
    requestAnimationFrame(animate)
    threeHtmlFiber.animate(camera)
    // ... rest of your render logic
}
```

## API

### ThreeHtmlFiber

Main class for managing HTML rendering on 3D objects.

#### Constructor
```javascript
new ThreeHtmlFiber(parentElement: HTMLElement)
```

#### Methods

| Method | Description |
|--------|-------------|
| `addObject(mesh, cssObject?)` | Attach HTML content to a Three.js mesh. Returns a `CSS3DObject`. |
| `render(camera)` | Manually trigger a render update (async). |
| `animate(camera)` | Queue-based render update for animation loops. |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `selectionOpacity` | `number` | Opacity of the overlay when text is selected (default: 0.1) |
| `extraBorder` | `number` | Border adjustment for texture sizing (default: 1.5) |

### HtmlRenderer

Handles the HTML-to-texture conversion.

#### Methods

| Method | Description |
|--------|-------------|
| `update(node)` | Convert an HTML element to a `CanvasTexture`. |
| `setPageStyles(css)` | Set CSS styles to be included in the render. |

## Demo

The included demo showcases:

- A glass-like dragon model with HTML content behind it
- Animated CSS spinners
- Wavy text animations
- Scrollable content
- Clickable buttons and links

### Demo Screenshot Features

- Gradient background with HTML content
- Multiple CSS animation examples (spinners, wavy text)
- Interactive button that tracks clicks
- Scrollable HTML area
- External links that open in new tabs

## Dependencies

- [Three.js](https://threejs.org/) - 3D rendering library
- [ts-browser-helpers](https://www.npmjs.com/package/ts-browser-helpers) - HTML to SVG conversion utilities
- [dat.gui](https://github.com/dataarts/dat.gui) - Debug GUI for the demo
- [Vite](https://vitejs.dev/) - Build tool and dev server

## Browser Support

Works in all modern browsers that support:
- WebGL
- CSS3DRenderer
- SVG foreignObject
- Canvas 2D

## Limitations

- Input elements (text fields, etc.) are not yet fully supported
- Complex CSS features may not render correctly in SVG foreignObject
- Performance depends on HTML complexity and update frequency
- External resources in HTML must be properly handled (CORS)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
