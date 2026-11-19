import {HtmlRenderer, floorSubpixelLayout} from './htmlRenderer'

export interface PolyfillOptions {
    pageStyles?: string
    force?: boolean
}

interface CanvasState {
    canvas: HTMLCanvasElement
    host: HTMLDivElement
    children: Set<HTMLElement>
    dirty: Set<HTMLElement>
    onpaint: ((e: Event) => void) | null
    rafHandle: number
    caretBlinkInterval: ReturnType<typeof setInterval> | null
    positionHost: () => void
    observers: (MutationObserver | ResizeObserver)[]
    cleanups: (() => void)[]
}

const CARET_BLINK_MS = 500

const STATES = new Map<HTMLCanvasElement, CanvasState>()
const renderer = new HtmlRenderer()
let installed = false

export function getHtmlRenderer(): HtmlRenderer {
    return renderer
}

const savedDescriptors: Array<[object, string, PropertyDescriptor | undefined]> = []
const globalListeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = []
// Maps elements redirected to a host back to their owning canvas, so
// patched parentNode/parentElement return the canvas instead of the host.
const parentOverrides = new WeakMap<Node, HTMLCanvasElement>()
let attributeObserver: MutationObserver | null = null
// Last `canvasTransform` set through updateElementGeometry() (or the 2D
// auto-sync in drawElementImage), returned by 1-arg getElementTransform().
const elementGeometry = new WeakMap<HTMLElement, DOMMatrix>()
// Snapshots handed out by captureElementImage(), accepted wherever the spec
// takes `(Element or ElementImage)`.
const capturedImages = new WeakMap<HTMLCanvasElement, HTMLElement>()

// A canvas opts in to HTML-in-Canvas with `content="drawable"` (Chromium 155+)
// or the legacy `layoutsubtree` attribute (Chromium 138–154).
const DRAWABLE_CANVAS_SELECTOR = 'canvas[content="drawable" i], canvas[layoutsubtree]'

function isDrawableCanvas(canvas: HTMLCanvasElement): boolean {
    return canvas.getAttribute('content')?.toLowerCase() === 'drawable' || canvas.hasAttribute('layoutsubtree')
}

// Only canvases on the new API get 2D geometry auto-sync; legacy
// `layoutsubtree` users apply the returned DOMMatrix themselves.
function usesModernApi(canvas: HTMLCanvasElement): boolean {
    return canvas.getAttribute('content')?.toLowerCase() === 'drawable'
}

export function installHtmlInCanvasPolyfill(options: PolyfillOptions = {}) {
    if (installed) return
    // If another copy (e.g. browser extension) already installed, uninstall it
    // so this bundle's version takes over with its own renderer/state.
    if ((window as any).__HTML_IN_CANVAS_POLYFILL__) {
        const prev = (window as any).__HIC_UNINSTALL__
        if (typeof prev === 'function') prev()
        else return // no way to cleanly replace, bail
    }
    const hasNative =
        'drawElementImage' in CanvasRenderingContext2D.prototype &&
        'requestPaint' in HTMLCanvasElement.prototype &&
        'onpaint' in HTMLCanvasElement.prototype
    const force = options.force ?? new URLSearchParams(location.search).has('polyfillHIC')
    if (hasNative && !force) {
        console.info('[html-in-canvas] Native API detected, polyfill skipped. Add ?polyfillHIC to URL to force.')
        return
    }
    installed = true;
    (window as any).__HTML_IN_CANVAS_POLYFILL__ = true;
    (window as any).__HIC_UNINSTALL__ = uninstallHtmlInCanvasPolyfill
    console.info('[html-in-canvas] Polyfill installed' + (force ? ' (forced)' : ''))

    if (options.pageStyles) renderer.setPageStyles(options.pageStyles)

    patchContext()
    patchWebGLContext()
    patchWebGPUQueue()
    patchCanvasElement()
    installGlobalListeners()
    scanAndObserve()
}

export function uninstallHtmlInCanvasPolyfill() {
    if (!installed) return

    for (const state of Array.from(STATES.values())) {
        teardownCanvasState(state)
    }
    STATES.clear()

    for (const [target, prop, desc] of savedDescriptors) {
        if (desc) Object.defineProperty(target, prop, desc)
        else delete (target as any)[prop]
    }
    savedDescriptors.length = 0

    for (const [target, type, handler, opts] of globalListeners) {
        target.removeEventListener(type, handler as any, opts as any)
    }
    globalListeners.length = 0

    attributeObserver?.disconnect()
    attributeObserver = null

    resizeScratchCanvas = null
    renderer.cleanup()

    installed = false;
    (window as any).__HTML_IN_CANVAS_POLYFILL__ = false
    delete (window as any).__HIC_UNINSTALL__
}

function requireState(canvas: HTMLCanvasElement, element: HTMLElement): CanvasState {
    const state = STATES.get(canvas) || ensureState(canvas)
    if (!state)
        throw new DOMException('canvas is not content="drawable" (or [layoutsubtree])', 'InvalidStateError')
    if (!state.children.has(element))
        throw new DOMException('element is not a direct child of the canvas', 'InvalidStateError')
    return state
}

// M = T_origin^-1 · S_css_to_grid^-1 · T_draw · S_css_to_grid · T_origin
function computeElementTransform(
    el: HTMLElement, drawTransform: DOMMatrix,
    sx: number, sy: number, cssW: number, cssH: number,
): DOMMatrix {
    const S = new DOMMatrix().scale(sx, sy)
    const Sinv = new DOMMatrix().scale(1 / sx, 1 / sy)
    const cs = getComputedStyle(el)
    const originParts = cs.transformOrigin.split(' ')
    const oxParsed = parseFloat(originParts[0])
    const oyParsed = parseFloat(originParts[1])
    const ox = Number.isFinite(oxParsed) ? oxParsed : cssW / 2
    const oy = Number.isFinite(oyParsed) ? oyParsed : cssH / 2
    const T_o = new DOMMatrix().translate(ox, oy)
    const T_oi = new DOMMatrix().translate(-ox, -oy)
    return T_oi.multiply(Sinv).multiply(drawTransform).multiply(S).multiply(T_o)
}

interface Snapshot {
    element: HTMLElement
    bitmap: HTMLCanvasElement
    cssW: number
    cssH: number
    dpr: number
}

// The spec takes `(Element or ElementImage)` almost everywhere. Our
// ElementImage is the snapshot canvas returned by captureElementImage().
function resolveElement(source: unknown, api: string): HTMLElement {
    if (source instanceof HTMLCanvasElement) {
        const owner = capturedImages.get(source)
        if (owner) return owner
    }
    if (!(source instanceof HTMLElement))
        throw new TypeError(`${api}: source must be an Element or ElementImage`)
    return source
}

function findSnapshot(element: HTMLElement): Snapshot | null {
    const bitmap = renderer.getCanvas(element)
    const css = renderer.getCssSize(element)
    if (!bitmap || !css) return null
    return {element, bitmap, cssW: css.width, cssH: css.height, dpr: Math.max(1, renderer.pixelRatio)}
}

function requireSnapshot(source: unknown, api: string): Snapshot {
    const snapshot = findSnapshot(resolveElement(source, api))
    if (!snapshot) {
        throw new DOMException(
            `${api}: no snapshot recorded yet for this element. ` +
            'Call from inside the canvas `onpaint` handler or after at least one `requestPaint()` + rAF cycle.',
            'InvalidStateError',
        )
    }
    return snapshot
}

// Like native Chromium: the element's CSS size in the owning canvas's grid
// pixels (canvas.width / clientWidth), independent of devicePixelRatio.
function canvasGridScale(element: HTMLElement): [number, number] {
    const canvas = parentOverrides.get(element)
    if (!canvas) {
        const dpr = Math.max(1, renderer.pixelRatio)
        return [dpr, dpr]
    }
    return [
        canvas.width / Math.max(1, canvas.clientWidth),
        canvas.height / Math.max(1, canvas.clientHeight),
    ]
}

// Source rects (sx/sy/swidth/sheight, sourceX/…) are in the element's CSS
// pixels; the snapshot bitmap is rasterized at devicePixelRatio.
function cropAndScale(
    snap: Snapshot,
    sx: number, sy: number, sw: number, sh: number,
    dw: number, dh: number,
): HTMLCanvasElement {
    const {bitmap, cssW, cssH, dpr} = snap
    const fullSource = sx === 0 && sy === 0 && sw === cssW && sh === cssH
    if (fullSource && dw === bitmap.width && dh === bitmap.height) return bitmap

    const out = getResizeScratchCanvas(dw, dh)
    const ctx = out.getContext('2d')!
    ctx.clearRect(0, 0, dw, dh)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    if (fullSource) ctx.drawImage(bitmap, 0, 0, dw, dh)
    else ctx.drawImage(bitmap, sx * dpr, sy * dpr, sw * dpr, sh * dpr, 0, 0, dw, dh)
    return out
}

// Applies a canvas transform (element CSS px -> canvas CSS px) to the
// element's DOM box, so the browser hit-tests it where it was drawn.
function applyElementGeometry(element: HTMLElement, canvasTransform: DOMMatrix) {
    const m = DOMMatrix.fromMatrix(canvasTransform)
    const values = m.toFloat64Array()
    for (let i = 0; i < values.length; i++) if (!Number.isFinite(values[i])) return
    elementGeometry.set(element, m)
    element.style.transformOrigin = '0 0'
    element.style.transform = m.toString()
}

function clearElementGeometryOf(element: HTMLElement) {
    if (!elementGeometry.delete(element)) return
    element.style.removeProperty('transform')
    element.style.removeProperty('transform-origin')
}

function patchContext() {
    definePatchedProperty(CanvasRenderingContext2D.prototype, 'drawElementImage', {
        configurable: true,
        writable: true,
        value: drawElementImage,
    })
}

interface DrawElementImageOptions {
    preserveElementGeometry?: boolean
}

// Overloads, each with an optional trailing DrawElementImageOptions:
//   (element, dx, dy)
//   (element, dx, dy, dwidth, dheight)
//   (element, sx, sy, swidth, sheight, dx, dy)
//   (element, sx, sy, swidth, sheight, dx, dy, dwidth, dheight)
//
// On `content="drawable"` canvases (Chromium 155+) this returns undefined and
// keeps the element's DOM geometry in sync with the draw, unless
// `preserveElementGeometry` is set. On legacy `layoutsubtree` canvases it
// returns the DOMMatrix to apply as the element's CSS transform.
function drawElementImage(
    this: CanvasRenderingContext2D,
    source: HTMLElement | HTMLCanvasElement,
    ...args: any[]
): DOMMatrix | undefined {
    let options: DrawElementImageOptions | undefined
    const last = args[args.length - 1]
    if (args.length && last !== null && typeof last === 'object') options = args.pop()

    const canvas = this.canvas as HTMLCanvasElement
    const element = resolveElement(source, 'drawElementImage')
    requireState(canvas, element)
    const modern = usesModernApi(canvas)

    const snap = findSnapshot(element)
    if (!snap) return modern ? undefined : new DOMMatrix()
    const {bitmap, cssW, cssH, dpr} = snap

    let sx = 0, sy = 0, sw = cssW, sh = cssH
    let dx: number, dy: number, dw: number | undefined, dh: number | undefined
    switch (args.length) {
    case 2: [dx, dy] = args; break
    case 4: [dx, dy, dw, dh] = args; break
    case 6: [sx, sy, sw, sh, dx, dy] = args; break
    case 8: [sx, sy, sw, sh, dx, dy, dw, dh] = args; break
    default:
        throw new TypeError(`drawElementImage: unexpected argument count ${1 + args.length}`)
    }

    // CSS px -> canvas grid px
    const gx = canvas.width / Math.max(1, canvas.clientWidth)
    const gy = canvas.height / Math.max(1, canvas.clientHeight)

    const dwGrid = dw ?? (sw * gx)
    const dhGrid = dh ?? (sh * gy)

    if (sx === 0 && sy === 0 && sw === cssW && sh === cssH) this.drawImage(bitmap, dx, dy, dwGrid, dhGrid)
    else this.drawImage(bitmap, sx * dpr, sy * dpr, sw * dpr, sh * dpr, dx, dy, dwGrid, dhGrid)

    // Maps the element (at grid scale) to where it was drawn in the grid.
    const T_draw = this.getTransform()
        .translate(dx, dy)
        .scale(dwGrid / (sw * gx), dhGrid / (sh * gy))
        .translate(-sx * gx, -sy * gy)

    if (!modern) return computeElementTransform(element, T_draw, gx, gy, cssW, cssH)

    if (!options?.preserveElementGeometry) {
        const S = new DOMMatrix().scale(gx, gy)
        const Sinv = new DOMMatrix().scale(1 / gx, 1 / gy)
        applyElementGeometry(element, Sinv.multiply(T_draw).multiply(S))
    }
    return undefined
}

function patchWebGLContext() {
    for (const Ctx of [
        typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext : null,
        typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext : null,
    ]) {
        if (!Ctx) continue
        definePatchedProperty(Ctx.prototype, 'texElementSubImage2D', {
            configurable: true, writable: true, value: texElementSubImage2D,
        })
        // Legacy (Chromium 138–154).
        definePatchedProperty(Ctx.prototype, 'texElementImage2D', {
            configurable: true, writable: true, value: texElementImage2D,
        })
    }
}

interface WebGLCopyElementImageConfig {
    sx?: number
    sy?: number
    swidth?: number
    sheight?: number
    width?: number
    height?: number
}

// Chromium 155+. Copies into an existing texture (allocate it first, e.g.
// with texImage2D(..., null) at getElementImageDefaultSize()), like
// texSubImage2D. Defaults to the snapshot's default size.
function texElementSubImage2D(
    this: WebGLRenderingContext,
    target: number,
    level: number,
    xoffset: number,
    yoffset: number,
    source: HTMLElement | HTMLCanvasElement,
    config: WebGLCopyElementImageConfig = {},
): void {
    if (arguments.length < 5)
        throw new TypeError(`texElementSubImage2D: expected at least 5 arguments, got ${arguments.length}`)

    const snap = requireSnapshot(source, 'texElementSubImage2D')
    const sx = config.sx ?? 0
    const sy = config.sy ?? 0
    const sw = config.swidth ?? snap.cssW
    const sh = config.sheight ?? snap.cssH
    const [gx, gy] = canvasGridScale(snap.element)
    const width = Math.max(1, Math.round(config.width ?? Math.ceil(sw * gx)))
    const height = Math.max(1, Math.round(config.height ?? Math.ceil(sh * gy)))

    const image = cropAndScale(snap, sx, sy, sw, sh, width, height)
    this.texSubImage2D(target, level, xoffset, yoffset, this.RGBA, this.UNSIGNED_BYTE, image)
}

// Legacy (Chromium 138–154): allocates and uploads in one call.
function texElementImage2D(
    this: WebGLRenderingContext,
    target: number,
    level: number,
    internalformat: number,
    ...rest: any[]
): void {
    let format: number, type: number, element: HTMLElement
    if (rest.length === 0) {
        // Chromium 150–154: (target, internalformat, element)
        element = internalformat as unknown as HTMLElement
        internalformat = level
        level = 0
        format = this.RGBA
        type = this.UNSIGNED_BYTE
    } else if (rest.length === 3) {
        [format, type, element] = rest
    } else if (rest.length === 5) {
        console.warn('[html-in-canvas polyfill] texElementImage2D(width,height,...) overload: dest resize not implemented, uploading at bitmap size')
        ;[/*width*/, /*height*/, format, type, element] = rest
    } else if (rest.length === 7) {
        console.warn('[html-in-canvas polyfill] texElementImage2D(sx,sy,swidth,sheight,...) overload: source crop not implemented, uploading full bitmap')
        ;[/*sx*/, /*sy*/, /*swidth*/, /*sheight*/, format, type, element] = rest
    } else if (rest.length === 9) {
        console.warn('[html-in-canvas polyfill] texElementImage2D(sx,sy,swidth,sheight,width,height,...) overload: source crop + dest resize not implemented, uploading full bitmap')
        ;[/*sx*/, /*sy*/, /*swidth*/, /*sheight*/, /*width*/, /*height*/, format, type, element] = rest
    } else {
        throw new TypeError(`texElementImage2D: unexpected argument count ${3 + rest.length}`)
    }

    const {bitmap} = requireSnapshot(element, 'texElementImage2D')
    this.texImage2D(target, level, internalformat, format, type, bitmap)
}

function patchWebGPUQueue() {
    const GPUQueue = (globalThis as any).GPUQueue
    if (!GPUQueue || !GPUQueue.prototype) return
    definePatchedProperty(GPUQueue.prototype, 'drawElementImageToTexture', {
        configurable: true, writable: true, value: drawElementImageToTexture,
    })
    // Legacy (Chromium 138–154).
    definePatchedProperty(GPUQueue.prototype, 'copyElementImageToTexture', {
        configurable: true, writable: true, value: copyElementImageToTexture,
    })
}

interface GPUDrawElementImageSource {
    source: HTMLElement | HTMLCanvasElement
    sourceX?: number
    sourceY?: number
    sourceWidth?: number
    sourceHeight?: number
}

type Extent = number[] | {width: number, height?: number, depthOrArrayLayers?: number}

function extentToSize(size: Extent | undefined): [number, number] | null {
    if (!size) return null
    if (Array.isArray(size)) return [size[0], size[1] ?? 1]
    return [size.width, size.height ?? 1]
}

// Chromium 155+.
//   drawElementImageToTexture({source, sourceX?, sourceY?, sourceWidth?, sourceHeight?},
//                             {texture, mipLevel?, origin?, ..., size?})
function drawElementImageToTexture(
    this: any, // GPUQueue
    source: GPUDrawElementImageSource,
    destination: {texture: unknown, size?: Extent, [k: string]: unknown},
): void {
    if (!source || typeof source !== 'object' || !('source' in source))
        throw new TypeError('drawElementImageToTexture: first argument must be {source: Element}')
    if (!destination || typeof destination !== 'object')
        throw new TypeError('drawElementImageToTexture: second argument must be {texture, size?}')

    const snap = requireSnapshot(source.source, 'drawElementImageToTexture')
    const sx = source.sourceX ?? 0
    const sy = source.sourceY ?? 0
    const sw = source.sourceWidth ?? snap.cssW
    const sh = source.sourceHeight ?? snap.cssH

    const {size, ...dest} = destination
    const [gx, gy] = canvasGridScale(snap.element)
    const [width, height] = extentToSize(size) ?? [Math.ceil(sw * gx), Math.ceil(sh * gy)]

    const image = cropAndScale(snap, sx, sy, sw, sh, width, height)
    this.copyExternalImageToTexture({source: image}, dest, [width, height])
}

// Legacy (Chromium 138–154):
//   copyElementImageToTexture(element, destination)
//   copyElementImageToTexture(element, width, height, destination)
//   copyElementImageToTexture({source}, {destination, width, height})   (Chromium 150–154)
function copyElementImageToTexture(
    this: any, // GPUQueue
    ...args: any[]
): void {
    let element: HTMLElement, destination: any, width: number, height: number
    if (args.length === 2 && args[0] && typeof args[0] === 'object' && 'source' in args[0]) {
        element = args[0].source
        destination = args[1]?.destination
        width = args[1]?.width ?? 0
        height = args[1]?.height ?? 0
    } else if (args.length === 2) {
        [element, destination] = args
        width = 0
        height = 0
    } else if (args.length === 4) {
        [element, width, height, destination] = args
    } else {
        throw new TypeError(
            `copyElementImageToTexture: expected 2 or 4 args, got ${args.length}`,
        )
    }

    const {bitmap} = requireSnapshot(element, 'copyElementImageToTexture')

    if (width === 0) width = bitmap.width
    if (height === 0) height = bitmap.height

    let source: HTMLCanvasElement = bitmap
    if (bitmap.width !== width || bitmap.height !== height) {
        source = getResizeScratchCanvas(width, height)
        const ctx = source.getContext('2d')!
        ctx.clearRect(0, 0, width, height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bitmap, 0, 0, width, height)
    }

    this.copyExternalImageToTexture(
        {source},
        destination,
        [width, height],
    )
}

let resizeScratchCanvas: HTMLCanvasElement | null = null
function getResizeScratchCanvas(w: number, h: number): HTMLCanvasElement {
    if (!resizeScratchCanvas) resizeScratchCanvas = document.createElement('canvas')
    if (resizeScratchCanvas.width !== w) resizeScratchCanvas.width = w
    if (resizeScratchCanvas.height !== h) resizeScratchCanvas.height = h
    return resizeScratchCanvas
}

// getElementTransform(element)                  Chromium 155+: the canvas
//     transform last set by updateElementGeometry() / drawElementImage(), or identity.
// getElementTransform(element, drawTransform)   legacy: the CSS transform that
//     aligns the element's DOM box with a draw at `drawTransform`:
//
// M = T_origin^-1 · S_c->g^-1 · drawTransform · S_c->g · T_origin
//
//   S_c->g = scale(canvas.width / canvas.clientWidth,
//                   canvas.height / canvas.clientHeight)  -- CSS px to grid px
//   T_origin = translate(ox, oy)                          -- the pivot (bitmap center)
function getElementTransform(
    this: HTMLCanvasElement,
    source: HTMLElement | HTMLCanvasElement,
    drawTransform?: DOMMatrix,
): DOMMatrix {
    const canvas = this
    const element = resolveElement(source, 'getElementTransform')
    requireState(canvas, element)

    if (drawTransform === undefined) {
        const current = elementGeometry.get(element)
        return current ? DOMMatrix.fromMatrix(current) : new DOMMatrix()
    }

    const cssSize = renderer.getCssSize(element)
    if (!cssSize)
        throw new DOMException('no snapshot recorded yet', 'InvalidStateError')

    const sx = canvas.width / Math.max(1, canvas.clientWidth)
    const sy = canvas.height / Math.max(1, canvas.clientHeight)
    return computeElementTransform(element, drawTransform, sx, sy, cssSize.width, cssSize.height)
}

interface UpdateElementGeometryOptions {
    canvasTransform?: DOMMatrixInit
    canvasClip?: DOMRectInit
    preserveHitTestOrder?: boolean
}

let warnedCanvasClip = false

// Chromium 155+. Positions the element's DOM box (for hit testing, focus,
// accessibility) with `canvasTransform`, which maps the element's CSS px into
// the canvas's CSS px. Needed for WebGL/WebGPU; 2D syncs automatically.
function updateElementGeometry(
    this: HTMLCanvasElement,
    source: HTMLElement | HTMLCanvasElement,
    options: UpdateElementGeometryOptions = {},
): void {
    const element = resolveElement(source, 'updateElementGeometry')
    requireState(this, element)
    if (options.canvasClip && !warnedCanvasClip) {
        warnedCanvasClip = true
        console.warn('[html-in-canvas polyfill] updateElementGeometry: canvasClip is not implemented, ignoring')
    }
    applyElementGeometry(element, DOMMatrix.fromMatrix(options.canvasTransform ?? {}))
}

function clearElementGeometry(
    this: HTMLCanvasElement,
    source: HTMLElement | HTMLCanvasElement,
): void {
    const element = resolveElement(source, 'clearElementGeometry')
    requireState(this, element)
    clearElementGeometryOf(element)
}

// Chromium 155+. Size, in canvas grid pixels, at which the element's snapshot
// is drawn by default: its CSS size × (canvas.width / canvas.clientWidth).
// Fractional; round up to allocate a texture for it. Unlike native, throws
// InvalidStateError until the first snapshot exists (three.js catches this,
// calls requestPaint() and retries).
function getElementImageDefaultSize(
    this: HTMLCanvasElement,
    source: HTMLElement | HTMLCanvasElement,
): {width: number, height: number} {
    const element = resolveElement(source, 'getElementImageDefaultSize')
    requireState(this, element)
    const snap = requireSnapshot(element, 'getElementImageDefaultSize')
    const gx = this.width / Math.max(1, this.clientWidth)
    const gy = this.height / Math.max(1, this.clientHeight)
    return {width: snap.cssW * gx, height: snap.cssH * gy}
}

function patchCanvasElement() {
    definePatchedProperty(HTMLCanvasElement.prototype, 'layoutSubtree', {
        configurable: true,
        get(this: HTMLCanvasElement) { return isDrawableCanvas(this) },
        set(this: HTMLCanvasElement, v: boolean) {
            if (v) this.setAttribute('layoutsubtree', '')
            else this.removeAttribute('layoutsubtree')
        },
    })

    // Chromium 155+: `content` reflects the attribute; only "fallback" and
    // "drawable" are valid, missing/invalid values read as "fallback".
    definePatchedProperty(HTMLCanvasElement.prototype, 'content', {
        configurable: true,
        get(this: HTMLCanvasElement) { return usesModernApi(this) ? 'drawable' : 'fallback' },
        set(this: HTMLCanvasElement, v: string) { this.setAttribute('content', String(v)) },
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'onpaint', {
        configurable: true,
        get(this: HTMLCanvasElement) { return STATES.get(this)?.onpaint ?? null },
        set(this: HTMLCanvasElement, fn: ((e: Event) => void) | null) {
            const s = ensureState(this)
            if (s) {
                s.onpaint = fn
            } else if (fn) {
                console.warn(
                    '[html-in-canvas polyfill] setting onpaint on a canvas without ' +
                    '`content="drawable"` — the handler will never fire. Set the ' +
                    '`content="drawable"` attribute first.',
                )
            }
        },
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'requestPaint', {
        configurable: true,
        writable: true,
        value: function (this: HTMLCanvasElement) {
            const s = ensureState(this)
            if (!s) return
            for (const c of s.children) s.dirty.add(c)
            schedulePaint(s, 'requestPaint')
        },
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'getElementTransform', {
        configurable: true,
        writable: true,
        value: getElementTransform,
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'updateElementGeometry', {
        configurable: true,
        writable: true,
        value: updateElementGeometry,
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'clearElementGeometry', {
        configurable: true,
        writable: true,
        value: clearElementGeometry,
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'getElementImageDefaultSize', {
        configurable: true,
        writable: true,
        value: getElementImageDefaultSize,
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'captureElementImage', {
        configurable: true,
        writable: true,
        value: function (this: HTMLCanvasElement, element: HTMLElement) {
            requireState(this, element)
            const canvas = renderer.getCanvas(element)
            if (!canvas)
                throw new DOMException('no snapshot recorded yet', 'InvalidStateError')
            capturedImages.set(canvas, element)
            // ElementImage.close() — the snapshot is owned by the polyfill.
            if (!('close' in canvas)) (canvas as any).close = () => {}
            return canvas
        },
    })

    interceptCanvasChildAccessor('children', host => host.children)
    interceptCanvasChildAccessor('firstElementChild', host => host.firstElementChild)
    interceptCanvasChildAccessor('lastElementChild', host => host.lastElementChild)
    interceptCanvasChildAccessor('childElementCount', host => host.childElementCount)

    patchCanvasDOMMutations()
    patchParentNode()
    patchCanvasEventListeners()
}

function interceptCanvasChildAccessor<K extends keyof Element>(
    prop: K,
    fromHost: (host: HTMLElement) => Element[K],
) {
    const origDesc = Object.getOwnPropertyDescriptor(Element.prototype, prop)!
    definePatchedProperty(HTMLCanvasElement.prototype, prop as string, {
        configurable: true,
        get(this: HTMLCanvasElement) {
            const s = STATES.get(this)
            if (s && isDrawableCanvas(this)) return fromHost(s.host)
            return origDesc.get!.call(this)
        },
    })
}

function addChildToState(state: CanvasState, el: HTMLElement, before?: Node | null) {
    if (state.children.has(el)) return
    if (before) state.host.insertBefore(el, before)
    else state.host.appendChild(el)
    el.style.position = 'absolute'
    el.style.left = '0'
    el.style.top = '0'
    el.style.opacity = '0'
    el.style.pointerEvents = 'auto'
    if ((window as any).__HIC_MUTATE_DOM__ !== false) floorSubpixelLayout(el)
    state.children.add(el)
    state.dirty.add(el)
    parentOverrides.set(el, state.canvas)
    schedulePaint(state, 'addChildToState')
}

function removeChildFromState(state: CanvasState, el: HTMLElement) {
    if (!state.children.has(el)) return false
    state.host.removeChild(el)
    state.children.delete(el)
    state.dirty.delete(el)
    parentOverrides.delete(el)
    clearElementGeometryOf(el)
    el.style.removeProperty('position')
    el.style.removeProperty('left')
    el.style.removeProperty('top')
    el.style.removeProperty('opacity')
    el.style.removeProperty('pointer-events')
    el.style.removeProperty('transform-origin')
    return true
}

function patchCanvasDOMMutations() {
    const origAppendChild = Node.prototype.appendChild
    definePatchedProperty(HTMLCanvasElement.prototype, 'appendChild', {
        configurable: true,
        writable: true,
        value: function <T extends Node>(this: HTMLCanvasElement, node: T): T {
            const s = STATES.get(this) || ensureState(this)
            if (s && isDrawableCanvas(this) && node instanceof HTMLElement) {
                addChildToState(s, node)
                return node
            }
            return origAppendChild.call(this, node) as T
        },
    })

    const origRemoveChild = Node.prototype.removeChild
    definePatchedProperty(HTMLCanvasElement.prototype, 'removeChild', {
        configurable: true,
        writable: true,
        value: function <T extends Node>(this: HTMLCanvasElement, node: T): T {
            const s = STATES.get(this)
            if (s && node instanceof HTMLElement && removeChildFromState(s, node)) {
                return node
            }
            return origRemoveChild.call(this, node) as T
        },
    })

    const origInsertBefore = Node.prototype.insertBefore
    definePatchedProperty(HTMLCanvasElement.prototype, 'insertBefore', {
        configurable: true,
        writable: true,
        value: function <T extends Node>(this: HTMLCanvasElement, node: T, ref: Node | null): T {
            const s = STATES.get(this) || ensureState(this)
            if (s && isDrawableCanvas(this) && node instanceof HTMLElement) {
                addChildToState(s, node, ref)
                return node
            }
            return origInsertBefore.call(this, node, ref) as T
        },
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'contains', {
        configurable: true,
        writable: true,
        value: function (this: HTMLCanvasElement, node: Node | null): boolean {
            const s = STATES.get(this)
            if (s && node && s.host.contains(node)) return true
            return Node.prototype.contains.call(this, node)
        },
    })
}

function patchParentNode() {
    for (const prop of ['parentNode', 'parentElement'] as const) {
        const orig = Object.getOwnPropertyDescriptor(Node.prototype, prop)!
        definePatchedProperty(Node.prototype, prop, {
            configurable: true,
            get(this: Node) {
                return parentOverrides.get(this) ?? orig.get!.call(this)
            },
        })
    }
}

const MOUSE_EVENT_TYPES = new Set([
    'mousemove', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave', 'mouseover', 'mouseout',
    'click', 'dblclick', 'contextmenu', 'wheel',
    'pointerdown', 'pointerup', 'pointermove', 'pointerenter', 'pointerleave', 'pointerover', 'pointerout',
])

function patchCanvasEventListeners() {
    const origAdd = EventTarget.prototype.addEventListener
    const origRemove = EventTarget.prototype.removeEventListener
    const hostListeners = new WeakMap<EventListenerOrEventListenerObject, EventListenerOrEventListenerObject>()

    definePatchedProperty(HTMLCanvasElement.prototype, 'addEventListener', {
        configurable: true,
        writable: true,
        value: function (this: HTMLCanvasElement, type: string, listener: any, options?: any) {
            origAdd.call(this, type, listener, options)
            // Force state init if the canvas is drawable — the
            // MutationObserver that would normally initialize the state runs
            // asynchronously, and callers often setAttribute() + addEventListener()
            // in the same synchronous block, racing the observer.
            const s = STATES.get(this) || ensureState(this)
            if (s && MOUSE_EVENT_TYPES.has(type) && listener) {
                const hostFn = typeof listener === 'function' ? listener.bind(this) : listener
                hostListeners.set(listener, hostFn)
                origAdd.call(s.host, type, hostFn, options)
            }
        },
    })

    definePatchedProperty(HTMLCanvasElement.prototype, 'removeEventListener', {
        configurable: true,
        writable: true,
        value: function (this: HTMLCanvasElement, type: string, listener: any, options?: any) {
            origRemove.call(this, type, listener, options)
            const s = STATES.get(this)
            if (s && MOUSE_EVENT_TYPES.has(type) && listener) {
                const hostFn = hostListeners.get(listener)
                if (hostFn) {
                    origRemove.call(s.host, type, hostFn, options)
                    hostListeners.delete(listener)
                }
            }
        },
    })
}

function definePatchedProperty(target: object, prop: string, descriptor: PropertyDescriptor) {
    savedDescriptors.push([target, prop, Object.getOwnPropertyDescriptor(target, prop)])
    Object.defineProperty(target, prop, descriptor)
}

function installGlobalListeners() {
    const repositionAll = () => {
        for (const state of STATES.values()) state.positionHost()
    }
    addGlobalListener(window, 'scroll', repositionAll, {passive: true})
    addGlobalListener(window, 'resize', repositionAll)

}

function addGlobalListener(
    target: EventTarget,
    type: string,
    handler: EventListener,
    opts?: boolean | AddEventListenerOptions,
) {
    target.addEventListener(type, handler, opts)
    globalListeners.push([target, type, handler, opts])
}

function scanAndObserve() {
    const initAll = () => {
        if (!installed) return
        document
            .querySelectorAll<HTMLCanvasElement>(DRAWABLE_CANVAS_SELECTOR)
            .forEach(ensureState)
    }
    if (document.readyState === 'loading') {
        addGlobalListener(document, 'DOMContentLoaded', initAll, {once: true})
    } else {
        initAll()
    }

    attributeObserver = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'attributes' && (m.attributeName === 'layoutsubtree' || m.attributeName === 'content')) {
                const t = m.target
                if (!(t instanceof HTMLCanvasElement)) continue
                if (isDrawableCanvas(t)) {
                    ensureState(t)
                } else {
                    const existing = STATES.get(t)
                    if (existing) {
                        teardownCanvasState(existing)
                        STATES.delete(t)
                    }
                }
            } else if (m.type === 'childList') {
                for (const added of Array.from(m.addedNodes)) {
                    if (added instanceof HTMLCanvasElement && isDrawableCanvas(added)) {
                        ensureState(added)
                    } else if (added instanceof Element) {
                        added
                            .querySelectorAll<HTMLCanvasElement>(DRAWABLE_CANVAS_SELECTOR)
                            .forEach(ensureState)
                    }
                }
            }
        }
    })
    attributeObserver.observe(document.documentElement, {
        attributes: true, subtree: true, attributeFilter: ['layoutsubtree', 'content'],
        childList: true,
    })
}

function ensureState(canvas: HTMLCanvasElement): CanvasState | null {
    const existing = STATES.get(canvas)
    if (existing) return existing
    if (!isDrawableCanvas(canvas)) return null

    const host = createHost(canvas)
    const children = new Set<HTMLElement>()
    const dirty = new Set<HTMLElement>()
    const observers: (MutationObserver | ResizeObserver)[] = []

    const positionHost = () => {
        const r = canvas.getBoundingClientRect()
        host.style.left = (r.left + window.scrollX + canvas.clientLeft) + 'px'
        host.style.top = (r.top + window.scrollY + canvas.clientTop) + 'px'
        host.style.width = canvas.clientWidth + 'px'
        host.style.height = canvas.clientHeight + 'px'
    }

    const state: CanvasState = {
        canvas, host, children, dirty,
        onpaint: null, rafHandle: 0, caretBlinkInterval: null, positionHost, observers, cleanups: [],
    }

    attachHostListeners(host, state)
    STATES.set(canvas, state)
    moveChildrenToHost(state)
    positionHost()
    attachObservers(state)

    return state
}

function createHost(canvas: HTMLCanvasElement): HTMLDivElement {
    const host = document.createElement('div')
    host.setAttribute('data-html-in-canvas-host', '')
    if (canvas.className) host.className = canvas.className
    if (canvas.id) host.setAttribute('data-host-of', canvas.id)
    host.style.cssText =
        'position:absolute;left:0;top:0;margin:0;padding:0;' +
        'pointer-events:auto;transform-style:preserve-3d;'
    document.body.appendChild(host)
    return host
}

function attachHostListeners(host: HTMLDivElement, state: CanvasState) {
    const markAllDirty = (reason = 'hostListener') => {
        for (const c of state.children) state.dirty.add(c)
        schedulePaint(state, reason)
    }

    host.addEventListener('load', e => {
        if (e.target instanceof HTMLImageElement) markAllDirty('image-load')
    }, true)

    host.addEventListener('input', () => markAllDirty('input'), true)
    host.addEventListener('change', () => markAllDirty('change'), true)

    const onSelectionChange = () => {
        const sel = window.getSelection()
        const hasPageSelection = sel && !sel.isCollapsed && sel.rangeCount > 0
            && host.contains(sel.getRangeAt(0).startContainer)
        if (host.contains(document.activeElement) || hasPageSelection) markAllDirty('selectionchange')
    }
    document.addEventListener('selectionchange', onSelectionChange)
    state.cleanups.push(() => document.removeEventListener('selectionchange', onSelectionChange))

    // Class changes flip through the existing MutationObserver in attachObservers().

    host.addEventListener('mouseover', e => {
        const target = e.target as HTMLElement
        if (!target.classList) return
        target.classList.add('pseudo-hover')
        for (const el of ancestorsUpTo(target, host)) el.classList.add('pseudo-hover')
    }, true)

    host.addEventListener('mouseout', e => {
        const target = e.target as HTMLElement
        if (!target.classList) return
        target.classList.remove('pseudo-hover')
        for (const el of target.querySelectorAll<HTMLElement>('.pseudo-hover')) {
            el.classList.remove('pseudo-hover')
        }
    }, true)

    host.addEventListener('focusin', e => {
        const target = e.target as HTMLElement
        if (!target.classList) return
        target.classList.add('pseudo-focus')
        for (const el of ancestorsUpTo(target, host)) el.classList.add('pseudo-focus-within')
        try {
            if (target.matches(':focus-visible')) target.classList.add('pseudo-focus-visible')
        } catch { /* :focus-visible not supported */ }

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            if (state.caretBlinkInterval) clearInterval(state.caretBlinkInterval)
            state.caretBlinkInterval = setInterval(() => markAllDirty('caret-blink'), CARET_BLINK_MS)
        }
    }, true)

    host.addEventListener('focusout', e => {
        const target = e.target as HTMLElement
        if (target.classList) target.classList.remove('pseudo-focus', 'pseudo-focus-visible')
        for (const el of host.querySelectorAll<HTMLElement>('.pseudo-focus-within')) {
            el.classList.remove('pseudo-focus-within')
        }

        if (state.caretBlinkInterval) {
            clearInterval(state.caretBlinkInterval)
            state.caretBlinkInterval = null
            markAllDirty('caret-remove') // One final repaint to remove the caret
        }
    }, true)

    host.addEventListener('pointerdown', e => {
        const target = e.target as HTMLElement
        if (!target.classList) return
        target.classList.add('pseudo-active')
        for (const el of ancestorsUpTo(target, host)) el.classList.add('pseudo-active')
    }, true)

    const clearActive = () => {
        for (const el of host.querySelectorAll<HTMLElement>('.pseudo-active')) {
            el.classList.remove('pseudo-active')
        }
    }
    host.addEventListener('pointerup', clearActive, true)
    host.addEventListener('pointercancel', clearActive, true)
}

function ancestorsUpTo(el: HTMLElement, stop: HTMLElement): HTMLElement[] {
    const result: HTMLElement[] = []
    let current = el.parentElement
    while (current && current !== stop) {
        result.push(current)
        current = current.parentElement
    }
    return result
}

const realChildren = Object.getOwnPropertyDescriptor(Element.prototype, 'children')!.get!

function moveChildrenToHost(state: CanvasState) {
    // Use the real children getter, not our patched one (which would return
    // host.children — empty at this point since nothing has been moved yet).
    for (const el of Array.from(realChildren.call(state.canvas)) as HTMLElement[]) {
        addChildToState(state, el)
    }
}

function attachObservers(state: CanvasState) {
    const resizeObs = new ResizeObserver(() => {
        state.positionHost()
        for (const c of state.children) state.dirty.add(c)
        schedulePaint(state, 'ResizeObserver')
    })
    resizeObs.observe(state.canvas)
    state.observers.push(resizeObs)

    const mutationObs = new MutationObserver(muts => {
        let any = false
        for (const m of muts) {
            let n: Node | null = m.target
            // Walk up to find the direct-child of host. Can't use patched
            // parentNode here (it would return canvas), so check children set.
            while (n && !(n instanceof HTMLElement && state.children.has(n))) n = n.parentNode
            if (n) {
                state.dirty.add(n as HTMLElement)
                any = true
            }
        }
        if (any) schedulePaint(state, 'MutationObserver')
    })
    mutationObs.observe(state.host, {childList: true, subtree: true, attributes: true, characterData: true})
    state.observers.push(mutationObs)
}

function teardownCanvasState(state: CanvasState) {
    if (state.rafHandle) {
        cancelAnimationFrame(state.rafHandle)
        state.rafHandle = 0
    }
    if (state.caretBlinkInterval) {
        clearInterval(state.caretBlinkInterval)
        state.caretBlinkInterval = null
    }
    for (const fn of state.cleanups) fn()
    state.cleanups.length = 0
    for (const obs of state.observers) obs.disconnect()
    state.observers.length = 0
    state.dirty.clear()
    state.onpaint = null

    const pseudoClasses = ['pseudo-hover', 'pseudo-focus', 'pseudo-focus-visible', 'pseudo-focus-within', 'pseudo-active'] as const
    for (const child of Array.from(state.children)) {
        child.classList.remove(...pseudoClasses)
        for (const el of child.querySelectorAll<HTMLElement>('.pseudo-hover, .pseudo-focus, .pseudo-focus-visible, .pseudo-focus-within, .pseudo-active')) {
            el.classList.remove(...pseudoClasses)
        }
        removeChildFromState(state, child)
        Node.prototype.appendChild.call(state.canvas, child)
    }
    state.host.remove()
}

const _debugHIC = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugPolyfillHIC')

function schedulePaint(state: CanvasState, _caller?: string) {
    if (_debugHIC && _caller) console.trace('[html-in-canvas debug] schedulePaint from:', _caller)
    if (state.rafHandle) return
    state.rafHandle = requestAnimationFrame(async () => {
        state.rafHandle = 0

        if (!STATES.has(state.canvas)) return

        state.positionHost()

        const changed = Array.from(state.dirty)
        state.dirty.clear()

        if (changed.length) {
            await Promise.all(changed.map(rasterizeOne))
        }

        if (!STATES.has(state.canvas)) return

        const ev = new Event('paint') as Event & { changedElements: HTMLElement[] }
        ;(ev as any).changedElements = changed
        try { state.onpaint?.call(state.canvas, ev) }
        catch (e) { console.error('[html-in-canvas polyfill] onpaint threw', e) }
        state.canvas.dispatchEvent(ev)
    })
}

async function rasterizeOne(el: HTMLElement) {
    try {
        await renderer.update(el)
    } catch (e) {
        console.error(
            `[html-in-canvas polyfill] rasterize failed for ${describeElement(el)}:`,
            e instanceof Error ? (e.message + '\n' + e.stack) : e,
        )
    }
}

function describeElement(el: HTMLElement): string {
    const tag = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ''
    const classAttr = el.getAttribute('class') || ''
    const cls = classAttr ? `.${classAttr.trim().replace(/\s+/g, '.')}` : ''
    return `<${tag}${id}${cls}>`
}
