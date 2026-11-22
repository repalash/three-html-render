type GeometryCanvas = HTMLCanvasElement & {
    content?: string
    updateElementGeometry?: (element: Element, options: {canvasTransform: DOMMatrixInit}) => void
}

/**
 * Places a canvas child so the browser hit-tests it where it is drawn.
 * `canvasTransform` maps the element's CSS px into the canvas's CSS px.
 *
 * Uses `canvas.updateElementGeometry()` (HTML-in-Canvas, Chromium 155+ and
 * this polyfill) when the canvas is `content="drawable"` and the element is
 * its child, which is the only way to position drawable children on the new
 * API. Otherwise falls back to a CSS transform, as on the legacy
 * `layoutsubtree` API or for plain overlays.
 *
 * Non-finite matrices (e.g. a zero-size element) are skipped.
 */
export function setElementCanvasTransform(
    canvas: HTMLCanvasElement | null,
    element: HTMLElement,
    canvasTransform: DOMMatrix,
): void {
    const values = canvasTransform.toFloat64Array()
    for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return

    const c = canvas as GeometryCanvas | null
    if (c && c.content === 'drawable' && typeof c.updateElementGeometry === 'function' && element.parentNode === c) {
        c.updateElementGeometry(element, {canvasTransform})
        return
    }
    element.style.transformOrigin = '0 0'
    element.style.transform = canvasTransform.toString()
}
