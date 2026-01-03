import {CanvasTexture} from 'three'
import {createImage, css, htmlToSvg, svgUrl} from 'ts-browser-helpers'

/**
 * HtmlRenderer - Converts HTML elements to Three.js CanvasTextures.
 *
 * This class handles the conversion of HTML content to textures that can be
 * applied to 3D meshes in Three.js. It works by:
 * 1. Converting HTML to SVG using foreignObject
 * 2. Rendering the SVG to an image
 * 3. Drawing the image to a canvas
 * 4. Creating a CanvasTexture from the canvas
 *
 * @example
 * ```typescript
 * const renderer = new HtmlRenderer();
 * renderer.setPageStyles(cssStyles);
 * const texture = await renderer.update(htmlElement);
 * mesh.material.map = texture;
 * ```
 */
export class HtmlRenderer{
    /** CSS styles to include when rendering HTML to SVG */
    private pageStyles = ''

    /**
     * Updates or creates a texture from an HTML element.
     *
     * Converts the HTML element's content to an SVG, renders it to an image,
     * and creates/updates a CanvasTexture. The texture is cached per element
     * and reused when possible.
     *
     * @param node - The HTML element to render as a texture.
     * @returns A promise that resolves to a CanvasTexture containing the rendered HTML.
     *
     * @example
     * ```typescript
     * const texture = await renderer.update(document.getElementById('content'));
     * material.map = texture;
     * material.needsUpdate = true;
     * ```
     */
    async update(node: HTMLElement){
        const rect = {width: node.clientWidth, height: node.clientHeight}
        const svg = this.h2s(rect, node)
        const image = await createImage(svgUrl(svg))
        image.width = rect.width
        image.height = rect.height
        const canvasTexture = this.updateTexture(this.textures.get(node) || null, rect, image)
        canvasTexture.addEventListener('dispose', ()=>{
            const exists = this.textures.get(node) === canvasTexture
            if(exists) this.textures.delete(node)
        })
        this.textures.set(node, canvasTexture)
        return canvasTexture
    }

    /**
     * Sets the CSS styles to be included when rendering HTML.
     *
     * These styles are injected into the SVG foreignObject to ensure
     * consistent rendering. Should include all CSS rules needed for
     * proper HTML appearance.
     *
     * @param styles - CSS string containing all necessary styles.
     *
     * @example
     * ```typescript
     * renderer.setPageStyles(`
     *   body { font-family: Arial, sans-serif; }
     *   .highlight { color: red; }
     * `);
     * ```
     */
    setPageStyles(styles: string) {
        // TODO: Accept in constructor and support async loading for URL refs
        // TODO: Embed URL references
        this.pageStyles = styles
    }

    /** Internal canvas element used for rendering */
    canvas = document.createElement('canvas')

    /** 2D rendering context for the canvas */
    context = this.canvas.getContext('2d')!;

    /**
     * Updates or creates a CanvasTexture from an image.
     *
     * Handles canvas resizing and texture recreation when dimensions change.
     * Disposes of old textures when new ones are created.
     *
     * @param canvasTexture - Existing texture to update, or null to create new.
     * @param rect - Dimensions for the texture (width and height).
     * @param image - The rendered image to draw to the canvas.
     * @returns The updated or newly created CanvasTexture.
     *
     * @internal
     */
    updateTexture(canvasTexture: CanvasTexture | null, rect: { width: number; height: number }, image: HTMLImageElement) {
        const scale = 1 // Could use window.devicePixelRatio for higher resolution

        const {canvas, context} = this

        if (!canvasTexture || canvas.width !== (rect.width * scale) || canvas.height !== (rect.height * scale)) {
            canvasTexture?.dispose()
            canvasTexture = new CanvasTexture(canvas)
            canvas.width = rect.width * scale
            canvas.height = rect.height * scale
        }

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvasTexture.needsUpdate = true

        return canvasTexture
    }

    /**
     * Recursively updates CSS custom properties for scroll positions and animations.
     *
     * This method traverses the element tree and:
     * - Sets `--scroll-left` and `--scroll-top` CSS variables for scrolled elements
     * - Sets `--animation-delay` for elements with CSS animations to sync timing
     *
     * These custom properties are then used by the SVG-only styles to replicate
     * scroll and animation states in the static SVG render.
     *
     * @param element - The root HTML element to process.
     *
     * @internal
     */
    updateScrollPositions(element: HTMLElement) {
        const styles = getComputedStyle(element);
        const animations = element.getAnimations()
        if (element.scrollLeft !== 0 || element.scrollTop !== 0 || element.style.getPropertyValue('--scroll-left')) {
            element.style.setProperty('--scroll-left', -element.scrollLeft + 'px');
            element.style.setProperty('--scroll-top', -element.scrollTop + 6 + 'px');
        }
        if(animations.length > 1){
            // Multiple animations on single element not yet supported
            return;
        }
        if(animations.length > 0){
            const anim = animations[0]
            const time = parseInt(anim.currentTime?.toString() ?? '0') / 1000
            const currentDelay = styles.animationDelay.replace('s', '')||'0'
            const delay = -parseInt(currentDelay) + time
            element.style.setProperty('--animation-delay', -delay + 's');
        }
        Array.from(element.children).forEach((a)=>(a as any).style && this.updateScrollPositions((a as any)));
    }

    /**
     * CSS styles applied only during SVG rendering.
     *
     * These styles use CSS custom properties set by updateScrollPositions()
     * to replicate scroll offsets and animation timing in the static SVG output.
     *
     * @internal
     */
    svgOnlyStyles = css`
[style*="--scroll-left"], [style*="--scroll-top"] {
    overflow: hidden !important;
}
[style*="--animation-delay"] {
    animation-delay: var(--animation-delay, 0s) !important;
}
[style*="--scroll-left"] > * , [style*="--scroll-top"] > * {
    transform: translate(var(--scroll-left, 0), var(--scroll-top, 0));
}
`

    /**
     * Converts an HTML element to an SVG string.
     *
     * Uses the foreignObject SVG element to embed HTML content.
     * Processes scroll positions and animations before conversion.
     *
     * @param rect - Dimensions for the SVG viewport.
     * @param node - The HTML element to convert.
     * @returns SVG markup string containing the HTML content.
     *
     * @internal
     */
    h2s(rect: { width: number; height: number }, node: HTMLElement) {
        let oHtml = node.innerHTML;
        this.updateScrollPositions(node)

        const options = {
            width: rect.width,
            height: rect.height
        }
        const style = this.pageStyles + '\n' + this.svgOnlyStyles;
        // TODO: Embed URL refs in HTML and CSS (for CSS it can be done once at initialization)
        const svg = htmlToSvg(oHtml, style, options, false)
            .replace('<svg viewBox', `<svg id="testSVGNODE" width="${rect.width}" height="${rect.height}" viewBox`)

        return svg
    }

    /**
     * Cache of textures keyed by their source HTML elements.
     * Allows texture reuse and proper disposal management.
     */
    textures = new Map<HTMLElement, CanvasTexture>()

}

// document.body.appendChild(canvas)
// canvas.style.position = 'fixed'
// canvas.style.top = '0'
// canvas.style.left = '0'
// canvas.style.zIndex = '100000'
// canvas.style.pointerEvents = 'none'
// canvasTexture.flipY = false
// canvasTexture.needsUpdate = true
