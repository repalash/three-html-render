import {CSS3DObject, CSS3DRenderer} from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import {Box3, Camera, Object3D, Scene, Vector3} from 'three'
import {HtmlRenderer} from './htmlRenderer.ts'

/**
 * ThreeHtmlFiber - Bridges HTML content with Three.js 3D objects.
 *
 * This class manages the rendering of HTML content onto 3D meshes by combining
 * CSS3DRenderer for interactive overlays and HtmlRenderer for texture generation.
 *
 * @example
 * ```typescript
 * const fiber = new ThreeHtmlFiber(document.getElementById('container'));
 * const cssObject = fiber.addObject(mesh);
 * cssObject.element.innerHTML = '<div>Hello World</div>';
 *
 * // In animation loop
 * fiber.animate(camera);
 * ```
 */
export class ThreeHtmlFiber {
    /** The CSS3DRenderer instance for rendering HTML overlays aligned with 3D objects */
    css3DRenderer: CSS3DRenderer

    /** The HtmlRenderer instance for converting HTML to canvas textures */
    htmlRenderer: HtmlRenderer

    /**
     * Extra border adjustment for texture sizing calculations.
     * Used to fine-tune the scale of CSS3D objects relative to mesh bounds.
     * @default 1.5
     */
    extraBorder = 1.5

    /** Queue of pending render operations with their IDs and promises */
    queue = [] as [number, Promise<void>][]

    /** Internal Three.js scene for CSS3D objects */
    scene = new Scene()

    /**
     * Opacity of the HTML overlay when text is selected.
     * Set to a low value to allow seeing the selection while maintaining the 3D effect.
     * @default 0.1
     */
    selectionOpacity = 0.1

    /**
     * Creates a new ThreeHtmlFiber instance.
     *
     * @param parent - The HTML element to attach the CSS3D renderer to.
     *                 This element should be positioned over the WebGL canvas.
     *
     * @example
     * ```typescript
     * const container = document.getElementById('html-overlay');
     * const fiber = new ThreeHtmlFiber(container);
     * ```
     */
    constructor(parent: HTMLElement) {
        const renderer = new CSS3DRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.style.pointerEvents = 'none'
        parent.appendChild(renderer.domElement);
        this.css3DRenderer = renderer

        this.htmlRenderer = new HtmlRenderer()

        // When something is selected, show the overlay div for text selection visibility
        document.addEventListener("selectionchange", () => {
            const selection = window.getSelection();
            this.scene.traverse(o => {
                const div = (o as CSS3DObject).element
                if (!div) return
                if (selection?.isCollapsed) div.style.opacity = '0'
                else if (selection?.containsNode(div, true)) div.style.opacity = this.selectionOpacity.toString()
            })
            console.log(selection)
        });
    }

    /** Array of [mesh, cssObject] pairs tracking which CSS3D objects are attached to which meshes */
    objects = [] as [Object3D, CSS3DObject][]

    /**
     * Attaches an HTML container to a Three.js mesh.
     *
     * Creates a CSS3DObject with a div element that will be positioned to match
     * the mesh's world transform. The div can then have HTML content added to it.
     *
     * @param mesh - The Three.js Object3D (typically a Mesh) to attach HTML content to.
     *               The mesh should have a material with a `map` property for texture assignment.
     * @param object - Optional existing CSS3DObject to use instead of creating a new one.
     * @returns The CSS3DObject containing the div element. Access `object.element` to add HTML content.
     *
     * @example
     * ```typescript
     * const cssObject = fiber.addObject(myMesh);
     * cssObject.element.innerHTML = '<h1>Hello</h1>';
     * cssObject.element.style.width = '512px';
     * ```
     */
    addObject(mesh: Object3D, object?: CSS3DObject) {
        const div = document.createElement('div');
        div.style.width = '100%';
        div.style.height = 'auto';
        div.style.aspectRatio = '1';
        div.style.backgroundColor = 'transparent';
        div.style.color = 'black';
        div.style.pointerEvents = 'none'
        div.style.overflow = 'hidden'
        div.id = 'css3dBgmesh'
        div.style.opacity = '0'

        object = object ?? new CSS3DObject(div);
        this.scene.add(object)
        this.objects.push([mesh, object])
        return object
    }

    /**
     * Renders all HTML content to textures and updates CSS3D object positions.
     *
     * This method:
     * 1. Updates CSS3DObject transforms to match their associated mesh world positions
     * 2. Scales CSS3D objects based on mesh bounding boxes
     * 3. Renders the CSS3D scene
     * 4. Converts HTML content to textures and assigns them to mesh materials
     *
     * @param camera - The Three.js camera to render from.
     * @returns A promise that resolves when all textures have been updated.
     *
     * @remarks
     * For animation loops, prefer using {@link animate} which handles queuing to prevent
     * multiple simultaneous render operations.
     */
    async render(camera: Camera) {
        for (const [mesh, object] of this.objects) {
            mesh.getWorldPosition(object.position)
            mesh.getWorldQuaternion(object.quaternion)
            let sc = (object.element.clientWidth < this.extraBorder ? 0 : (object.element.clientWidth - this.extraBorder))
            const bounds = new Box3().expandByObject(mesh).getSize(new Vector3())
            console.log(bounds)
            object.scale.set(bounds.x / sc, bounds.y / sc, 1 / sc)
        }
        this.css3DRenderer.render(this.scene, camera);
        for (const [mesh, object] of this.objects) {
            if (!(mesh as any).material) {
                console.warn('no material', mesh)
                return
            }
            // @ts-ignore
            mesh.material.map = await this.htmlRenderer.update(object.element)
        }
    }

    /**
     * Queue-based render method for use in animation loops.
     *
     * Prevents multiple simultaneous render operations by maintaining a queue.
     * If a render is already in progress, additional calls are skipped to maintain performance.
     *
     * @param camera - The Three.js camera to render from.
     *
     * @example
     * ```typescript
     * function animate() {
     *     requestAnimationFrame(animate);
     *     fiber.animate(camera);
     *     renderer.render(scene, camera);
     * }
     * ```
     */
    animate(camera: Camera) {
        if (this.queue.length > 1) return
        let id = Math.random()
        this.queue.push([id, this.render(camera)
            .then(() => {
                this.queue.splice(this.queue.findIndex(a => a[0] === id), 1)
            })
        ])
    }

}
