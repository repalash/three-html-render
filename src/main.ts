import './style.css'
import './sample.js'
import {CanvasTexture, Mesh, PerspectiveCamera, Scene} from 'three'
import {CSS3DObject, CSS3DRenderer} from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import {createImage, css, htmlToSvg, svgUrl} from 'ts-browser-helpers';

const {
    bgMesh, camera
} = (window as any).common as {
    bgMesh: Mesh,
    camera: PerspectiveCamera
};

const canvasHtml = document.getElementById('canvas-html') as HTMLDivElement
const htcontent = canvasHtml.innerHTML
canvasHtml.innerHTML = ''

const renderer = new CSS3DRenderer();
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.domElement.style.pointerEvents = 'none'
canvasHtml.appendChild( renderer.domElement );

window.addEventListener('resize', ()=>{
    renderer.setSize( window.innerWidth, window.innerHeight );
})

const div = document.createElement( 'div' );
div.style.width = '1024px';
div.style.height = 'auto';
div.style.aspectRatio = '1';
div.style.backgroundColor = 'transparent';
div.style.color = 'black';
div.style.pointerEvents = 'none'
div.style.overflow = 'hidden'
div.id = 'css3dBgmesh'
div.innerHTML = htcontent
// div.contentEditable = 'true'
div.style.opacity = '0'
// div.style.filter = 'opacity(0)'
// div.style.visibility = 'hidden'

// when something is selected, show div
document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    div.style.opacity = !selection?.isCollapsed ? '0.1' : '0'
    console.log(selection)
});


let clicki = 0
div.querySelector('#btn1')!.addEventListener('click', (ev)=>{
    // @ts-ignore
    ev.currentTarget!.innerHTML = 'clicked ' + (clicki++||'')
})

const object = new CSS3DObject( div );
object.position.set( 0,0,0 );

const scene = new Scene()
scene.add(object)

// object.rotation.y = ry;
const extraBorder = 1.5
// let rendering = false
const queue = [] as [number, Promise<void>][]

async function process(){
    // div.style.opacity = '0'
    bgMesh.getWorldPosition(object.position)
    bgMesh.getWorldQuaternion(object.quaternion)
    let sc = (object.element.clientWidth < extraBorder ? 0 : (object.element.clientWidth - extraBorder))
    sc = 5/sc
    object.scale.set(1,1,1).multiplyScalar(sc)
    renderer.render( scene, camera );
    await make()
    // div.style.opacity = '0.5'
}

function animate(){
    requestAnimationFrame(animate)
    if(queue.length > 1) return
    let id = Math.random()
    queue.push([id, process()
        .then(()=>{queue.splice(queue.findIndex(a=>a[0]===id), 1)})
    ])
}

const canvas = document.createElement('canvas')
// document.body.appendChild(canvas)
// canvas.style.position = 'fixed'
// canvas.style.top = '0'
// canvas.style.left = '0'
// canvas.style.zIndex = '100000'
// canvas.style.pointerEvents = 'none'
let canvasTexture = null as CanvasTexture | null
// canvasTexture.flipY = false
// canvasTexture.needsUpdate = true

const context = canvas.getContext('2d')!;

// Recursively update scroll positions
function updateScrollPositions(element: HTMLElement) {
    const styles = getComputedStyle(element);
    const animations = element.getAnimations()
    if (element.scrollLeft !== 0 || element.scrollTop !== 0 || element.style.getPropertyValue('--scroll-left')) {
        element.style.setProperty('--scroll-left', -element.scrollLeft + 'px');
        element.style.setProperty('--scroll-top', -element.scrollTop + 6 + 'px');
        // console.log(styles.transform)
    }
    if(animations.length > 1){
        // console.error('not supported multiple animations', element, animations)
        return;
    }
    if(animations.length > 0){
        const anim = animations[0]
        const time = parseInt(anim.currentTime?.toString() ?? '0') / 1000
        const currentDelay = styles.animationDelay.replace('s', '')||'0'
        const delay = -parseInt(currentDelay) + time
        element.style.setProperty('--animation-delay', -delay + 's');
    }
    Array.from(element.children).forEach((a)=>(a as any).style && updateScrollPositions((a as any)));
}
const svgOnlyStyles = css`
        [style*="--scroll-left"], [style*="--scroll-top"] {
            overflow: hidden !important;
        }
        [style*="--animation-delay"] {
            animation-delay: var(--animation-delay, 0s) !important;
        }
        [style*="--scroll-left"] > * , [style*="--scroll-top"] > * {
            transform: translate(var(--scroll-left, 0), var(--scroll-top, 0));
        }
      `

async function make(){
    // const time = now();
    let node = div
    // console.log(pageTime)
    updateScrollPositions(node)
    // node = node.cloneNode(true)
    // const node = document.body
    // const rect = node.getBoundingClientRect();
    const rect = {width: node.clientWidth, height: node.clientHeight}
    // console.log(rect)
    let oHtml = node.innerHTML;

    // todo remove scripts
    // oHtml = oHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // const template = document.createElement('div');
    // template.innerHTML = oHtml;
    // oHtml = template.innerHTML;
    const options = {
        width: rect.width,
        height: rect.height
    }
    // console.log(rect)
    const cStyle = document.getElementById('hstyle')!;
    const style = cStyle.innerHTML + '\n' + svgOnlyStyles;
    // todo embedUrlRefs
    const svg = htmlToSvg(oHtml, style, options, false)
        .replace('<svg viewBox', `<svg id="testSVGNODE" width="${rect.width}" height="${rect.height}" viewBox`)
    document.createElement('svg')

    // console.log(svg)
    // svgContainer.innerHTML = svg;
    // const svgNode = document.getElementById('testSVGNODE')

    const image = await createImage(svgUrl(svg))
    image.width = rect.width
    image.height = rect.height

    const scale = 1//window.devicePixelRatio

    // console.log(rect.width, rect.height)

    if(!canvasTexture || canvas.width !== (rect.width * scale) || canvas.height !== (rect.height * scale)) {
        canvasTexture?.dispose()
        canvasTexture = new CanvasTexture(canvas)
        canvas.width = rect.width * scale
        canvas.height = rect.height * scale
        // @ts-ignore
        bgMesh.material.map = canvasTexture
    }

    // imgContainer.innerHTML = ''
    // imgContainer.appendChild(image)

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvasTexture.needsUpdate = true
    // drawImage(image)
    // console.log('time:', now() - time, 'ms')
}

animate()


