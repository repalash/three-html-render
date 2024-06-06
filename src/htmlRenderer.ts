import {CanvasTexture} from 'three'
import {createImage, css, htmlToSvg, svgUrl} from 'ts-browser-helpers'

export class HtmlRenderer{
    private pageStyles = ''

    async update(node: HTMLElement){
        const rect = {width: node.clientWidth, height: node.clientHeight}
        const svg = this.h2s(rect, node)
        const image = await createImage(svgUrl(svg))
        image.width = rect.width
        image.height = rect.height
        const canvasTexture = this.updateTexture(this.textures.get(node) || null, rect, image)
        canvasTexture.addEventListener('dispose', ()=>{
            const exists = this.textures.get(node) === canvasTexture
            if(exists) this.textures.delete(node)
        })
        this.textures.set(node, canvasTexture)
        return canvasTexture
    }

    setPageStyles(styles: string) { // todo accept in constructor? should also be async to load urls.
        // todo embed url refs
        this.pageStyles = styles
    }

    canvas = document.createElement('canvas')

    context = this.canvas.getContext('2d')!;

    updateTexture(canvasTexture: CanvasTexture | null, rect: { width: number; height: number }, image: HTMLImageElement) {
        const scale = 1//window.devicePixelRatio

        // console.log(rect.width, rect.height)
        const {canvas, context} = this

        if (!canvasTexture || canvas.width !== (rect.width * scale) || canvas.height !== (rect.height * scale)) {
            canvasTexture?.dispose()
            canvasTexture = new CanvasTexture(canvas)
            canvas.width = rect.width * scale
            canvas.height = rect.height * scale
        }

        // imgContainer.innerHTML = ''
        // imgContainer.appendChild(image)

        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvasTexture.needsUpdate = true
        // drawImage(image)
        // console.log('time:', now() - time, 'ms')

        return canvasTexture
    }

    // Recursively update scroll positions
    updateScrollPositions(element: HTMLElement) {
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
        Array.from(element.children).forEach((a)=>(a as any).style && this.updateScrollPositions((a as any)));
    }

    svgOnlyStyles = css`
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

    h2s(rect: { width: number; height: number }, node: HTMLElement) {
        let oHtml = node.innerHTML;
        this.updateScrollPositions(node)
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
        const style = this.pageStyles + '\n' + this.svgOnlyStyles;
        // todo embedUrlRefs in html and css, for css it can be done once at the beginning
        const svg = htmlToSvg(oHtml, style, options, false)
            .replace('<svg viewBox', `<svg id="testSVGNODE" width="${rect.width}" height="${rect.height}" viewBox`)

        // document.createElement('svg')
        // console.log(svg)
        // svgContainer.innerHTML = svg;
        // const svgNode = document.getElementById('testSVGNODE')
        return svg
    }

    textures = new Map<HTMLElement, CanvasTexture>()

}

// document.body.appendChild(canvas)
// canvas.style.position = 'fixed'
// canvas.style.top = '0'
// canvas.style.left = '0'
// canvas.style.zIndex = '100000'
// canvas.style.pointerEvents = 'none'
// canvasTexture.flipY = false
// canvasTexture.needsUpdate = true
