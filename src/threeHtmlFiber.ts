import {CSS3DObject, CSS3DRenderer} from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import {Box3, Camera, Object3D, Scene, Vector3} from 'three'
import {HtmlRenderer} from './htmlRenderer.ts'

export class ThreeHtmlFiber {
    css3DRenderer: CSS3DRenderer
    htmlRenderer: HtmlRenderer

    extraBorder = 1.5
    // rendering = false
    queue = [] as [number, Promise<void>][]
    scene = new Scene()
    selectionOpacity = 0.1

    constructor(parent: HTMLElement) {
        const renderer = new CSS3DRenderer();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.domElement.style.pointerEvents = 'none'
        parent.appendChild(renderer.domElement);
        this.css3DRenderer = renderer
        // object.rotation.y = ry;

        this.htmlRenderer = new HtmlRenderer()

        // when something is selected, show div
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

    objects = [] as [Object3D, CSS3DObject][]

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
        // div.contentEditable = 'true'
        div.style.opacity = '0'
        // div.style.filter = 'opacity(0)'
        // div.style.visibility = 'hidden'

        object = object ?? new CSS3DObject(div);
        // object.position.set( 0,0,0 );
        this.scene.add(object)
        this.objects.push([mesh, object])
        return object
    }

    async render(camera: Camera) {
        for (const [mesh, object] of this.objects) {
            // div.style.opacity = '0'
            mesh.getWorldPosition(object.position)
            mesh.getWorldQuaternion(object.quaternion)
            let sc = (object.element.clientWidth < this.extraBorder ? 0 : (object.element.clientWidth - this.extraBorder))
            // todo bounds of mesh
            const bounds = new Box3().expandByObject(mesh).getSize(new Vector3())
            console.log(bounds)
            // sc = 5/sc
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
