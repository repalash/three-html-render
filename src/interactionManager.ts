import {Matrix4, Vector3} from 'three'
import type {Camera, Mesh, Object3D, WebGLRenderer} from 'three'
import type {HTMLTextureLike} from './htmlTexture'

const _pixelToLocal = new Matrix4()
const _mvp = new Matrix4()
const _viewport = new Matrix4()
const _size = new Vector3()

/**
 * Port of three.js 0.184's `InteractionManager` (three/addons/interaction/InteractionManager.js).
 *
 *   import { InteractionManager } from 'three-html-render'
 *   const interactions = new InteractionManager()
 *   interactions.connect(renderer, camera)
 *   interactions.add(mesh)
 *   // in the animation loop:
 *   interactions.update()
 *
 * Positions the DOM element of each registered mesh's HTMLTexture using a
 * single CSS `matrix3d` transform per frame, so the browser dispatches
 * pointer events natively to the real HTML.
 *
 * Math matches three.js exactly: `viewport × projection × view × world × pixelToLocal`.
 *
 * The sole change from upstream: the element is read from
 * `texture._sourceElement || texture.image` so it works both with three.js's
 * native HTMLTexture (image === element) and with our fallback HTMLTexture
 * (image === captured canvas, _sourceElement === element).
 */
export class InteractionManager {
    objects: Object3D[] = []
    element: HTMLCanvasElement | null = null
    camera: Camera | null = null

    private _cachedCssW = -1
    private _cachedCssH = -1

    add(...objects: Object3D[]): this {
        for (const object of objects) {
            if (this.objects.indexOf(object) === -1) this.objects.push(object)
        }
        return this
    }

    remove(...objects: Object3D[]): this {
        for (const object of objects) {
            const index = this.objects.indexOf(object)
            if (index !== -1) this.objects.splice(index, 1)
        }
        return this
    }

    connect(renderer: WebGLRenderer, camera: Camera): void {
        this.camera = camera
        this.element = renderer.domElement
    }

    update(): void {
        const canvas = this.element
        const camera = this.camera
        if (canvas === null || camera === null) return

        const cssW = canvas.clientWidth
        const cssH = canvas.clientHeight

        if (cssW !== this._cachedCssW || cssH !== this._cachedCssH) {
            _viewport.set(
                cssW / 2, 0, 0, cssW / 2,
                0, -cssH / 2, 0, cssH / 2,
                0, 0, 1, 0,
                0, 0, 0, 1,
            )
            this._cachedCssW = cssW
            this._cachedCssH = cssH
        }

        for (const object of this.objects) {
            const mesh = object as Mesh
            const material = mesh.material as {map?: HTMLTextureLike | null} | undefined
            const texture = material?.map
            if (!texture || !texture.isHTMLTexture) continue

            const element = (texture._sourceElement || texture.image) as HTMLElement | null
            if (!element || !(element instanceof HTMLElement)) continue

            element.style.position = 'absolute'
            element.style.left = '0'
            element.style.top = '0'
            element.style.transformOrigin = '0 0'

            const elemW = element.offsetWidth
            const elemH = element.offsetHeight

            const geometry = mesh.geometry
            if (!geometry) continue
            if (!geometry.boundingBox) geometry.computeBoundingBox()
            geometry.boundingBox!.getSize(_size)

            _pixelToLocal.set(
                _size.x / elemW, 0, 0, -_size.x / 2,
                0, -_size.y / elemH, 0, _size.y / 2,
                0, 0, 1, geometry.boundingBox!.max.z,
                0, 0, 0, 1,
            )

            _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
            _mvp.multiply(mesh.matrixWorld)
            _mvp.multiply(_pixelToLocal)
            _mvp.premultiply(_viewport)

            element.style.transform = 'matrix3d(' + _mvp.elements.join(',') + ')'
        }
    }

    disconnect(): void {
        this.camera = null
        this.element = null
        this._cachedCssW = -1
        this._cachedCssH = -1
    }
}
