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

        (canvas as any).onpaint = () => {
            this._uploadTextures()
        }
    }

    addObject(element: HTMLElement, mesh: Object3D): OverlayObject {
        element.style.pointerEvents = 'auto'

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

        for (const {element, mesh} of this.overlayRenderer.objects) {
            let texture = this._textures.get(element)

            if (HTMLTextureClass) {
                if (!texture) {
                    texture = new HTMLTextureClass(element) as Texture
                    this._textures.set(element, texture)
                    this._assignTexture(mesh, texture)
                }
                continue
            }

            const gl = renderer.getContext() as any

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
