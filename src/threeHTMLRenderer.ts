import * as THREE from 'three'
import {Mesh, Object3D, Texture} from 'three'
import type {Camera, WebGLRenderer} from 'three'
import {HtmlOverlayRenderer} from './htmlOverlayRenderer'
import type {OverlayObject} from './htmlOverlayRenderer'

const HTMLTextureClass: any = 'HTMLTexture' in THREE ? (THREE as any).HTMLTexture : null

export class ThreeHTMLRenderer {
    overlayRenderer: HtmlOverlayRenderer
    selectionOpacity = 0

    private _textures = new WeakMap<HTMLElement, Texture>()
    private _renderer: WebGLRenderer | null = null
    private _canvas: HTMLCanvasElement | null = null

    constructor() {
        this.overlayRenderer = new HtmlOverlayRenderer()

        // Only manage opacity for selection when running under the polyfill.
        // Native Canary needs elements visible for texElementImage2D rasterization.
        if ((window as any).__HTML_IN_CANVAS_POLYFILL__) {
            document.addEventListener('selectionchange', () => {
                const selection = window.getSelection()
                const active = !!selection && !selection.isCollapsed
                for (const {element} of this.overlayRenderer.objects) {
                    if (active && selection!.containsNode(element, true)) {
                        element.style.opacity = this.selectionOpacity.toString()
                    } else {
                        element.style.opacity = '0'
                    }
                }
            })
        }
    }

    connect(canvas: HTMLCanvasElement, camera: Camera, renderer: WebGLRenderer) {
        this.overlayRenderer.connect(canvas, camera);
        this._renderer = renderer;
        this._canvas = canvas;

        // HTML-in-Canvas (Chromium 155+ / polyfill) opts the canvas in with content="drawable".
        if ('content' in canvas && (canvas as any).content !== 'drawable' && !canvas.hasAttribute('layoutsubtree'))
            canvas.setAttribute('content', 'drawable');

        (canvas as any).onpaint = () => {
            this._uploadTextures()
        }
    }

    addObject(element: HTMLElement, mesh: Object3D): OverlayObject {
        element.style.pointerEvents = 'auto'
        if (!element.hasAttribute('drawable')) element.setAttribute('drawable', '')

        // Stop event propagation so controls (e.g. OrbitControls) don't intercept
        for (const evt of ['pointerdown', 'pointerup', 'pointermove', 'click', 'wheel'] as const) {
            element.addEventListener(evt, (e) => e.stopPropagation())
        }

        // Re-rasterize on scroll
        element.addEventListener('scroll', () => {
            if (this._canvas) (this._canvas as any).requestPaint()
        })

        return this.overlayRenderer.add(element, mesh)
    }

    update() {
        // Request repaint every frame for CSS animations
        if (this._canvas) (this._canvas as any).requestPaint()
        this.overlayRenderer.update()
    }

    private _uploadTextures() {
        const renderer = this._renderer
        const canvas = this._canvas
        if (!renderer || !canvas) return

        const gl = renderer.getContext() as any

        for (const {element, mesh} of this.overlayRenderer.objects) {
            let texture = this._textures.get(element)

            // HTML-in-Canvas (Chromium 155+, or the polyfill): copy into a
            // texture we allocate at the snapshot's default size. Works with
            // any three.js version, unlike three r184–r187's HTMLTexture,
            // which needs the pre-155 API.
            if (typeof gl.texElementSubImage2D === 'function') {
                if (!texture) {
                    texture = new Texture()
                    texture.minFilter = 1006 // LinearFilter
                    texture.generateMipmaps = false
                    this._textures.set(element, texture)
                    this._assignTexture(mesh, texture)
                }
                this._uploadElement(renderer, gl, canvas, texture, element)
                continue
            }

            if (HTMLTextureClass) {
                if (!texture) {
                    texture = new HTMLTextureClass(element) as Texture
                    this._textures.set(element, texture)
                    this._assignTexture(mesh, texture)
                }
                continue
            }

            if ('texElementImage2D' in gl) {
                if (!texture) {
                    texture = new Texture()
                    texture.minFilter = 1006 // LinearFilter
                    texture.generateMipmaps = false
                    this._textures.set(element, texture)
                    this._assignTexture(mesh, texture)
                }

                const props = (renderer as any).properties.get(texture)
                if (!props.__webglTexture) {
                    props.__webglTexture = gl.createTexture()
                }

                gl.bindTexture(gl.TEXTURE_2D, props.__webglTexture)
                gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

                props.__version = texture.version

            } else {
                let snapshot: any
                try {
                    snapshot = (canvas as any).captureElementImage(element)
                } catch { continue }
                if (!snapshot) continue
                if (!texture) {
                    texture = new Texture(snapshot)
                    texture.minFilter = 1006 // LinearFilter
                    texture.generateMipmaps = false
                    this._textures.set(element, texture)
                    this._assignTexture(mesh, texture)
                } else {
                    texture.image = snapshot
                }
                texture.needsUpdate = true
            }
        }
    }

    private _uploadElement(renderer: WebGLRenderer, gl: any, canvas: HTMLCanvasElement, texture: Texture, element: HTMLElement) {
        let size: {width: number, height: number}
        try {
            size = (canvas as any).getElementImageDefaultSize(element)
        } catch {
            return // not painted yet; the next paint event retries
        }
        const width = Math.ceil(size.width)
        const height = Math.ceil(size.height)

        const props = (renderer as any).properties.get(texture)
        const state = (renderer as any).state
        if (!props.__webglTexture) props.__webglTexture = gl.createTexture()

        // Go through three's state cache where it exists so it stays in sync.
        if (state?.bindTexture) state.bindTexture(gl.TEXTURE_2D, props.__webglTexture)
        else gl.bindTexture(gl.TEXTURE_2D, props.__webglTexture)
        const pixelStorei = (pname: number, value: number | boolean) =>
            state?.pixelStorei ? state.pixelStorei(pname, value) : gl.pixelStorei(pname, value)
        pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY)
        pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha)

        // Re-allocate only when the size changes; it resets the contents.
        if (props.__htmlWidth !== width || props.__htmlHeight !== height) {
            const internalFormat = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? gl.RGBA8 : gl.RGBA
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
            props.__htmlWidth = width
            props.__htmlHeight = height
        }

        try {
            gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, element, {width, height})
        } catch {
            /* no paint record for the element yet */
        }
        props.__version = texture.version
    }

    private _assignTexture(mesh: Object3D, texture: Texture) {
        if (mesh instanceof Mesh && mesh.material) {
            (mesh.material as any).map = texture;
            (mesh.material as any).needsUpdate = true
        }
    }

    getTexture(element: HTMLElement): Texture | null {
        return this._textures.get(element) ?? null
    }
}
