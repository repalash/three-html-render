import * as THREE from 'three'
import {Texture} from 'three'

type PaintCanvas = HTMLCanvasElement & {
    requestPaint?: () => void
    captureElementImage?: (el: HTMLElement) => HTMLCanvasElement
}

/**
 * Any texture recognised as an HTMLTexture by our interaction managers —
 * either three.js's native one (`image` is the element) or this package's
 * fallback (`image` is the captured canvas, `_sourceElement` is the element).
 */
export type HTMLTextureLike = Texture & {
    isHTMLTexture?: boolean
    _sourceElement?: HTMLElement | null
    image?: HTMLElement | HTMLCanvasElement | null
}

const NativeHTMLTexture = (THREE as unknown as {HTMLTexture?: typeof Texture}).HTMLTexture

/**
 * Matches three.js's upstream `THREE.HTMLTexture` (three >= 0.184).
 *
 *   import { HTMLTexture } from 'three-html-render'
 *   material.map = new HTMLTexture(element)
 *
 * On three.js >= 0.184 this simply re-exports the native class unchanged.
 *
 * On older three.js, it falls back to `canvas.captureElementImage(element)`
 * + a paint listener: each `paint` event re-captures the element as a 2D
 * canvas and stores it in `this.image`, so three.js's normal texture upload
 * path handles the rest (flipY, colorspace, state tracking). The fallback
 * keeps the original element in `_sourceElement` so our InteractionManager /
 * RaycastInteractionManager can still locate it.
 *
 * Requirement for the fallback path: append the element to a
 * `<canvas layoutsubtree>` *before* constructing the texture. Upstream
 * three.js auto-appends from inside its upload branch; we can't hook into
 * that on older versions.
 */
class HTMLTextureFallback extends Texture {
    isHTMLTexture = true

    _sourceElement: HTMLElement | null = null
    private _paintHandler: ((e: Event) => void) | null = null
    private _paintCanvas: PaintCanvas | null = null

    constructor(
        element?: HTMLElement,
        mapping?: THREE.Mapping,
        wrapS?: THREE.Wrapping,
        wrapT?: THREE.Wrapping,
        magFilter?: THREE.MagnificationTextureFilter,
        minFilter?: THREE.MinificationTextureFilter,
        format?: THREE.PixelFormat,
        type?: THREE.TextureDataType,
        anisotropy?: number,
    ) {
        super(undefined as any, mapping, wrapS, wrapT, magFilter, minFilter, format, type, anisotropy)
        this.generateMipmaps = false
        this.needsUpdate = true

        if (!element) return
        this._sourceElement = element

        const parent = element.parentNode as PaintCanvas | null
        if (!parent || !('requestPaint' in parent)) return

        const handler = () => {
            try {
                this.image = parent.captureElementImage!(element)
                this.needsUpdate = true
            } catch {
                /* snapshot not yet available — will retry on next paint */
            }
        }
        parent.addEventListener('paint', handler)
        this._paintHandler = handler
        this._paintCanvas = parent
        parent.requestPaint!()
    }

    dispose() {
        if (this._paintCanvas && this._paintHandler) {
            this._paintCanvas.removeEventListener('paint', this._paintHandler)
            this._paintCanvas = null
            this._paintHandler = null
        }
        super.dispose()
    }
}

export const HTMLTexture = (NativeHTMLTexture || HTMLTextureFallback) as typeof HTMLTextureFallback
export type HTMLTexture = InstanceType<typeof HTMLTexture>
