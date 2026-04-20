import {Raycaster, Vector2} from 'three'
import type {Camera, Material, Mesh, Object3D, WebGLRenderer} from 'three'
import type {HTMLTextureLike} from './htmlTexture'

/**
 * Keeps a single HTML element aligned with the 3D surface under the pointer
 * by raycasting the scene, reading the hit UV, and translating the element
 * so that its matching texture pixel sits exactly at the pointer. Unlike
 * three.js's InteractionManager (matrix3d-per-face), a single element works
 * for any face of a box or any point of a curved surface — the browser's
 * native hit-testing does the rest, so clicks, focus, selection and hover
 * all flow through normal DOM semantics.
 *
 * Based on Jake Archibald's curved-markup demo:
 * https://github.com/jakearchibald/random-stuff/blob/main/apps/curved-markup/src/App/index.tsx
 *
 * Registered meshes are expected to use an HTMLTexture as their
 * `material.map` — either three.js's native `THREE.HTMLTexture` (>=0.184,
 * where `texture.image` is the element) or this package's fallback
 * `HTMLTexture` (older three.js, where `texture._sourceElement` is the
 * element and `texture.image` holds the captured canvas snapshot). Any
 * texture with `isHTMLTexture === true` and an element in either location
 * is driven.
 */
export class RaycastInteractionManager {
    objects: Object3D[] = []
    element: HTMLCanvasElement | null = null
    camera: Camera | null = null

    private _raycaster = new Raycaster()
    private _pointer = new Vector2()
    private _onPointerBound: ((e: PointerEvent) => void) | null = null

    add(...objects: Object3D[]): this {
        for (const o of objects) if (this.objects.indexOf(o) === -1) this.objects.push(o)
        return this
    }

    remove(...objects: Object3D[]): this {
        for (const o of objects) {
            const i = this.objects.indexOf(o)
            if (i !== -1) this.objects.splice(i, 1)
        }
        return this
    }

    connect(renderer: WebGLRenderer, camera: Camera): void {
        this.disconnect()
        this.camera = camera
        this.element = renderer.domElement
        const h = (e: PointerEvent) => this._onPointer(e)
        this._onPointerBound = h
        this.element.addEventListener('pointermove', h)
        this.element.addEventListener('pointerdown', h)
    }

    disconnect(): void {
        if (this.element && this._onPointerBound) {
            this.element.removeEventListener('pointermove', this._onPointerBound)
            this.element.removeEventListener('pointerdown', this._onPointerBound)
        }
        this._onPointerBound = null
        this.element = null
        this.camera = null
    }

    // Kept for API parity with three.js's InteractionManager — no-op here.
    update(): void { /* event-driven */ }

    private _onPointer(e: PointerEvent): void {
        const canvas = this.element
        const camera = this.camera
        if (!canvas || !camera) return

        const rect = canvas.getBoundingClientRect()
        this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        this._raycaster.setFromCamera(this._pointer, camera)

        const hit = this._raycaster.intersectObjects(this.objects, false).find(h => !!h.uv)
        if (!hit || !hit.uv) {
            this._parkAllElements()
            return
        }

        const element = this._getElement(hit.object)
        if (!element) return

        const w = element.offsetWidth
        const h = element.offsetHeight
        if (w === 0 || h === 0) return

        const texX = hit.uv.x * w
        const texY = (1 - hit.uv.y) * h
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        for (const obj of this.objects) {
            const other = this._getElement(obj)
            if (other && other !== element) this._parkElement(other)
        }

        element.style.position = 'absolute'
        element.style.left = '0'
        element.style.top = '0'
        element.style.transform = `translate(${mouseX - texX}px, ${mouseY - texY}px)`
    }

    private _parkAllElements(): void {
        for (const obj of this.objects) {
            const el = this._getElement(obj)
            if (el) this._parkElement(el)
        }
    }

    private _parkElement(el: HTMLElement): void {
        el.style.transform = 'translate(-99999px, 0)'
    }

    private _getElement(obj: Object3D): HTMLElement | null {
        const mesh = obj as Mesh
        const material = mesh.material as Material & {map?: HTMLTextureLike | null} | undefined
        const texture = material && material.map
        if (!texture || !texture.isHTMLTexture) return null
        // Native HTMLTexture: image === element.
        // Our fallback HTMLTexture: image === canvas snapshot, _sourceElement === element.
        const el = texture._sourceElement || texture.image
        return el instanceof HTMLElement ? el : null
    }
}
