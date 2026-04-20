export interface StandaloneObject {
    element: HTMLElement
    worldMatrix: Float32Array | number[]
    localSize: {x: number; y: number; z: number}
    localMaxZ: number
}

/**
 * Matrix3d-based HTML overlay positioning without a three.js dependency.
 *
 *   import { InteractionManagerStandalone } from 'three-html-render/interaction-manager-standalone'
 *
 * This is the same math as the three.js `InteractionManager` (and upstream
 * three.js's `three/addons/interaction/InteractionManager.js`) but the
 * caller supplies raw projection / view / world matrices instead of a
 * `Camera` + `Mesh`. Use it when you're driving your own WebGL / WebGPU /
 * 2D scene and don't want to pull in three.js just for one matrix multiply.
 *
 * Bonus over the three.js version: backface culling — the element is
 * hidden (`display: none`, `pointer-events: none`) when the surface's
 * normal points away from the camera.
 */
export class InteractionManagerStandalone {
    objects: StandaloneObject[] = []
    canvas: HTMLCanvasElement | null = null

    private _projectionMatrix: Float32Array | null = null
    private _viewMatrix: Float32Array | null = null
    private _cachedCssW = -1
    private _cachedCssH = -1
    private _viewport = new DOMMatrix()

    connect(canvas: HTMLCanvasElement, projectionMatrix: Float32Array, viewMatrix: Float32Array) {
        this.canvas = canvas
        this._projectionMatrix = projectionMatrix
        this._viewMatrix = viewMatrix
    }

    setProjectionMatrix(m: Float32Array) {
        this._projectionMatrix = m
    }

    setViewMatrix(m: Float32Array) {
        this._viewMatrix = m
    }

    add(
        element: HTMLElement,
        worldMatrix: Float32Array | number[],
        localSize: {x: number; y: number; z: number},
        localMaxZ: number,
    ): StandaloneObject {
        const obj: StandaloneObject = {element, worldMatrix, localSize, localMaxZ}
        this.objects.push(obj)
        return obj
    }

    remove(obj: StandaloneObject) {
        const i = this.objects.indexOf(obj)
        if (i !== -1) this.objects.splice(i, 1)
    }

    update() {
        const canvas = this.canvas
        const proj = this._projectionMatrix
        const view = this._viewMatrix
        if (!canvas || !proj || !view) return

        const cssW = canvas.clientWidth
        const cssH = canvas.clientHeight

        if (cssW !== this._cachedCssW || cssH !== this._cachedCssH) {
            this._viewport = new DOMMatrix([
                cssW / 2, 0, 0, 0,
                0, -cssH / 2, 0, 0,
                0, 0, 1, 0,
                cssW / 2, cssH / 2, 0, 1,
            ])
            this._cachedCssW = cssW
            this._cachedCssH = cssH
        }

        const projDM = new DOMMatrix(Array.from(proj))
        const viewDM = new DOMMatrix(Array.from(view))

        for (const obj of this.objects) {
            const {element, worldMatrix, localSize, localMaxZ} = obj

            element.style.position = 'absolute'
            element.style.left = '0'
            element.style.top = '0'
            element.style.transformOrigin = '0 0'

            const elemW = element.offsetWidth
            const elemH = element.offsetHeight
            if (elemW <= 0 || elemH <= 0) continue

            const worldArr = worldMatrix instanceof Float32Array
                ? Array.from(worldMatrix) : worldMatrix
            const worldDM = new DOMMatrix(worldArr)

            const pixelToLocal = new DOMMatrix([
                localSize.x / elemW, 0, 0, 0,
                0, -localSize.y / elemH, 0, 0,
                0, 0, 1, 0,
                -localSize.x / 2, localSize.y / 2, localMaxZ, 1,
            ])

            const mvp = new DOMMatrix(Array.from(projDM.toFloat64Array()))
            mvp.multiplySelf(viewDM)
            mvp.multiplySelf(worldDM)
            mvp.multiplySelf(pixelToLocal)
            mvp.preMultiplySelf(this._viewport)

            // Backface culling: check if face normal (0,0,1) points toward camera
            const vw = new DOMMatrix(Array.from(viewDM.toFloat64Array()))
            vw.multiplySelf(worldDM)
            const frontFacing = vw.m33 > 0

            element.style.pointerEvents = frontFacing ? 'auto' : 'none'
            element.style.display = frontFacing ? '' : 'none'
            element.style.transform = 'matrix3d(' + Array.from(mvp.toFloat64Array()).join(',') + ')'
        }
    }

    disconnect() {
        this.canvas = null
        this._projectionMatrix = null
        this._viewMatrix = null
        this._cachedCssW = -1
        this._cachedCssH = -1
    }
}
