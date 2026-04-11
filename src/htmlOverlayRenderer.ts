import {Matrix4, Vector3} from 'three'
import type {Camera, Object3D} from 'three'

const _pixelToLocal = new Matrix4()
const _mvp = new Matrix4()
const _viewport = new Matrix4()
const _size = new Vector3()

export interface OverlayObject {
    element: HTMLElement
    mesh: Object3D
}

/**
 * Positions HTML elements over their corresponding 3D meshes using a single
 * CSS matrix3d transform per element.
 *
 * Ported from Three.js InteractionManager (three/addons/interaction/InteractionManager.js).
 * Math: viewport × projection × view × world × pixelToLocal
 */
export class HtmlOverlayRenderer {
    objects: OverlayObject[] = []
    canvas: HTMLCanvasElement | null = null
    camera: Camera | null = null

    private _cachedCssW = -1
    private _cachedCssH = -1

    connect(canvas: HTMLCanvasElement, camera: Camera) {
        this.canvas = canvas
        this.camera = camera
    }

    add(element: HTMLElement, mesh: Object3D): OverlayObject {
        const obj: OverlayObject = {element, mesh}
        if (this.objects.indexOf(obj) === -1) {
            this.objects.push(obj)
        }
        return obj
    }

    remove(obj: OverlayObject) {
        const index = this.objects.indexOf(obj)
        if (index !== -1) this.objects.splice(index, 1)
    }

    update() {
        const canvas = this.canvas
        const camera = this.camera
        if (!canvas || !camera) return

        // Viewport: NDC (-1,1) → CSS pixels, Y flipped.
        const cssW = canvas.clientWidth
        const cssH = canvas.clientHeight

        if (cssW !== this._cachedCssW || cssH !== this._cachedCssH) {
            _viewport.set(
                cssW / 2, 0, 0, cssW / 2,
                0, -cssH / 2, 0, cssH / 2,
                0, 0, 1, 0,
                0, 0, 0, 1
            )
            this._cachedCssW = cssW
            this._cachedCssH = cssH
        }

        for (const obj of this.objects) {
            const {element, mesh} = obj

            element.style.position = 'absolute'
            element.style.left = '0'
            element.style.top = '0'
            element.style.transformOrigin = '0 0'

            const elemW = element.offsetWidth
            const elemH = element.offsetHeight
            if (elemW <= 0 || elemH <= 0) continue

            const geometry = (mesh as any).geometry
            if (!geometry) continue
            if (!geometry.boundingBox) geometry.computeBoundingBox()
            geometry.boundingBox.getSize(_size)

            // Map element pixels (0,0)-(elemW,elemH) → mesh local coords.
            // Front face: top-left (-sizeX/2, sizeY/2, maxZ), bottom-right (sizeX/2, -sizeY/2, maxZ).
            _pixelToLocal.set(
                _size.x / elemW, 0, 0, -_size.x / 2,
                0, -_size.y / elemH, 0, _size.y / 2,
                0, 0, 1, geometry.boundingBox.max.z,
                0, 0, 0, 1
            )

            // MVP
            _mvp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
            _mvp.multiply(mesh.matrixWorld)
            _mvp.multiply(_pixelToLocal)

            // Viewport
            _mvp.premultiply(_viewport)

            // Browser performs perspective divide (by w) when applying matrix3d.
            element.style.transform = 'matrix3d(' + _mvp.elements.join(',') + ')'
        }
    }

    disconnect() {
        this.canvas = null
        this.camera = null
        this._cachedCssW = -1
        this._cachedCssH = -1
    }
}
