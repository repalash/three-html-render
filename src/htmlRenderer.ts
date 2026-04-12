import {createImage, css, embedUrlRefs} from 'ts-browser-helpers'
import {syncFormState} from './syncFormState'

const _debugHIC = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugPolyfillHIC')

export class HtmlRenderer {
    pixelRatio = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1

    private pageStyles = ''
    private entries = new Map<HTMLElement, RendererEntry>()
    private pageStylesCssPromise: Promise<string> | null = null

    async update(node: HTMLElement): Promise<HTMLCanvasElement> {
        const cssW = node.clientWidth || node.offsetWidth
        const cssH = node.clientHeight || node.offsetHeight
        if (cssW === 0 || cssH === 0) {
            const existing = this.entries.get(node)
            if (existing) return existing.canvas
            return this.ensureEntry(node, 1, 1).canvas
        }

        const entry = this.ensureEntry(node, cssW, cssH)
        const dpr = Math.max(1, this.pixelRatio)
        const pxW = entry.canvas.width
        const pxH = entry.canvas.height
        const svg = await this.buildSvg(node, cssW, cssH, dpr)

        if (svg === entry.lastSvg) {
            if (_debugHIC)
                console.log('[html-in-canvas debug] rasterization skipped (unchanged)')
            return entry.canvas
        }
        if (_debugHIC && entry.lastSvg) {
            const oldLines = entry.lastSvg.split('<')
            const newLines = svg.split('<')
            const diffs: string[] = []
            const len = Math.max(oldLines.length, newLines.length)
            for (let i = 0; i < len; i++) {
                if (oldLines[i] !== newLines[i]) {
                    diffs.push(`  - ${(oldLines[i] || '').slice(0, 120)}`)
                    diffs.push(`  + ${(newLines[i] || '').slice(0, 120)}`)
                }
                if (diffs.length > 20) { diffs.push('  ...'); break }
            }
            console.log('[html-in-canvas debug] SVG changed:\n' + diffs.join('\n'))
        }
        entry.lastSvg = svg

        const image = await loadSvgAsImage(svg, pxW, pxH)
        entry.context.clearRect(0, 0, pxW, pxH)
        entry.context.drawImage(image, 0, 0, pxW, pxH)
        return entry.canvas
    }

    getCanvas(node: HTMLElement): HTMLCanvasElement | null {
        return this.entries.get(node)?.canvas ?? null
    }

    getCssSize(node: HTMLElement): { width: number; height: number } | null {
        const e = this.entries.get(node)
        return e ? {width: e.cssW, height: e.cssH} : null
    }

    setPageStyles(styles: string) {
        this.pageStyles = styles
    }

    async getPageStylesCss(): Promise<string> {
        if (!this.pageStylesCssPromise) {
            const promise = collectAndInlinePageStyles()
            this.pageStylesCssPromise = promise
            promise.catch(() => {
                if (this.pageStylesCssPromise === promise) {
                    this.pageStylesCssPromise = null
                }
            })
        }
        return this.pageStylesCssPromise
    }

    invalidatePageStylesCss() {
        this.pageStylesCssPromise = null
    }

    cleanup() {
        if (mirrorDiv) {
            mirrorDiv.remove()
            mirrorDiv = null
        }
    }

    captureDynamicStateOnClone(src: HTMLElement, dst: HTMLElement) {
        const srcAll = [src, ...src.querySelectorAll<HTMLElement>('*')]
        const dstAll = [dst, ...dst.querySelectorAll<HTMLElement>('*')]
        if (srcAll.length !== dstAll.length) return
        for (let i = 0; i < srcAll.length; i++) {
            writeDynamicStateInline(srcAll[i], dstAll[i])
        }
        injectCaretAndSelection(src, dst)
        injectPageSelection(src, dst)
    }

    readonly svgOnlyStyles = css`
[style*="--scroll-left"], [style*="--scroll-top"] {
    overflow: hidden !important;
}
[style*="--animation-delay"] {
    animation-delay: var(--animation-delay, 0s) !important;
}
[style*="--scroll-left"] > *, [style*="--scroll-top"] > * {
    transform: translate(var(--scroll-left, 0), var(--scroll-top, 0));
}
`

    private ensureEntry(node: HTMLElement, cssW: number, cssH: number): RendererEntry {
        const dpr = Math.max(1, this.pixelRatio)
        const width = Math.max(1, Math.ceil(cssW * dpr))
        const height = Math.max(1, Math.ceil(cssH * dpr))
        let entry = this.entries.get(node)
        if (!entry) {
            const canvas = document.createElement('canvas')
            canvas.width = width
            canvas.height = height
            const context = canvas.getContext('2d')!
            entry = {canvas, context, cssW, cssH}
            this.entries.set(node, entry)
        } else {
            if (entry.canvas.width !== width || entry.canvas.height !== height) {
                entry.canvas.width = width
                entry.canvas.height = height
            }
            entry.cssW = cssW
            entry.cssH = cssH
        }
        return entry
    }

    private async buildSvg(node: HTMLElement, cssW: number, cssH: number, _dpr = 1): Promise<string> {
        const clone = await prepareClone(node)
        this.captureDynamicStateOnClone(node, clone)
        const innerXml = wrapClone(node, new XMLSerializer().serializeToString(clone))

        const pageStylesCss = await this.getPageStylesCss()
        const style = BASELINE_CSS + '\n' + pageStylesCss + '\n' + this.pageStyles + '\n' + this.svgOnlyStyles

        const svg = (
            `<svg xmlns="http://www.w3.org/2000/svg"` +
            ` width="${cssW}" height="${cssH}" viewBox="0 0 ${cssW} ${cssH}">` +
            `<style><![CDATA[${style}]]></style>` +
            `<foreignObject x="0" y="0" width="100%" height="100%">${innerXml}</foreignObject>` +
            `</svg>`
        )
        if (_debugHIC) {
            let dbg = document.getElementById('__hic-svg-debug__') as HTMLDivElement
            if (!dbg) {
                dbg = document.createElement('div')
                dbg.id = '__hic-svg-debug__'
                dbg.style.cssText = 'position:absolute;z-index:99999;pointer-events:none;opacity:0.3;box-sizing:border-box;margin:0;padding:0;border:none;overflow:hidden;'
                document.body.appendChild(dbg)
            }
            const canvasEl = document.querySelector('canvas')
            if (canvasEl) {
                const cr = canvasEl.getBoundingClientRect()
                dbg.style.left = (cr.left + window.scrollX) + 'px'
                dbg.style.top = (cr.top + window.scrollY) + 'px'
                dbg.style.width = cr.width + 'px'
                dbg.style.height = cr.height + 'px'
            }
            if (!dbg.innerHTML) {
                dbg.innerHTML = svg
                const svgEl = dbg.querySelector('svg')
                if (svgEl) { svgEl.style.width = '100%'; svgEl.style.height = '100%'; }
            }
        }
        return svg

        // todo - makes no difference
        // const pxW = Math.ceil(cssW * dpr)
        // const pxH = Math.ceil(cssH * dpr)
        //
        // // SVG width/height = device pixels (rasterization size)
        // // foreignObject width/height = device pixels (Safari uses these for layout, ignoring viewBox)
        // // CSS zoom scales content back to CSS pixel layout within the device-pixel foreignObject
        // const needsZoom = dpr !== 1
        // const zoomStyle = needsZoom ? ` style="zoom:${dpr}"` : ''
        //
        // return (
        //     `<svg xmlns="http://www.w3.org/2000/svg"` +
        //     ` width="${pxW}" height="${pxH}" viewBox="0 0 ${pxW} ${pxH}">` +
        //     `<style><![CDATA[${style}]]></style>` +
        //     `<foreignObject x="0" y="0" width="${pxW}" height="${pxH}">` +
        //     `<div xmlns="http://www.w3.org/1999/xhtml"${zoomStyle}>${innerXml}</div>` +
        //     `</foreignObject>` +
        //     `</svg>`
        // )

    }
}

interface RendererEntry {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    cssW: number
    cssH: number
    lastSvg?: string
}

async function prepareClone(node: HTMLElement): Promise<HTMLElement> {
    const clone = node.cloneNode(true) as HTMLElement
    syncFormState(node, clone)
    freezeResolvedTextMetrics(node, clone)
    clone.style.removeProperty('transform')
    clone.style.opacity = '1'
    clone.style.visibility = 'visible'
    await inlineExternalImages(clone)
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
    return clone
}

function wrapClone(node: HTMLElement, cloneXml: string): string {
    const parentEl = node.parentElement
    const parentClass = parentEl?.getAttribute('class') || ''
    const parentW = parentEl?.clientWidth || node.clientWidth || node.offsetWidth
    const parentH = parentEl?.clientHeight || node.clientHeight || node.offsetHeight

    const classAttr = parentClass ? ` class="${escapeXmlAttr(parentClass)}"` : ''
    const ancestorOpen =
        `<div xmlns="http://www.w3.org/1999/xhtml"${classAttr}` +
        ` style="position:relative;width:${parentW}px;height:${parentH}px;margin:0;padding:0;">`
    const ancestorClose = '</div>'

    return (
        `<html xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;background:transparent !important;">` +
        `<body style="margin:0;padding:0;background:transparent !important;">` +
        ancestorOpen + cloneXml + ancestorClose +
        `</body></html>`
    )
}

async function loadSvgAsImage(svg: string, cssW: number, cssH: number): Promise<HTMLImageElement> {
    const dataUrl = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
    try {
        return await createImage(dataUrl)
    } catch (e) {
        const type = (e && typeof e === 'object' && 'type' in (e as any)) ? (e as any).type : typeof e
        const err = new Error(
            `HtmlRenderer: SVG image failed to load (${type}). ` +
            `cssW=${cssW}, cssH=${cssH}, svg.length=${svg.length}. ` +
            `svg head: ${svg.slice(0, 300).replace(/\s+/g, ' ')}…`,
        )
        ;(err as any).cause = e
        ;(err as any).svg = svg
        throw err
    }
}

async function collectAndInlinePageStyles(): Promise<string> {
    const sheets: string[] = []

    for (const sheet of Array.from(document.styleSheets)) {
        try {
            const cssRules = Array.from(sheet.cssRules || [])
            sheets.push(cssRules.map(r => r.cssText).join('\n'))
        } catch {
            if (!sheet.href) continue
            try {
                const res = await fetch(sheet.href)
                if (res.ok) sheets.push(await res.text())
            } catch (e) {
                console.warn('[HtmlRenderer] failed to fetch stylesheet', sheet.href, e)
            }
        }
    }

    if (sheets.length === 0) return ''

    let combined: string
    try {
        combined = await embedUrlRefs(sheets.join('\n'), async (url) => {
            // Skip W3C namespace URIs — not actual resources
            if (url.startsWith('http://www.w3.org/')) return url
            try { return await fetchAsDataUrl(url) }
            catch { return url }
        })
    } catch (e) {
        console.warn('[HtmlRenderer] URL embedding failed', e)
        combined = sheets.join('\n')
    }

    const pseudoRules = rewritePseudoClasses(combined)
    return pseudoRules ? combined + '\n' + pseudoRules : combined
}

const BASELINE_CSS = `
a { color: -webkit-link; text-decoration: underline; cursor: pointer; }
*.pseudo-focus-visible { outline: auto 1px -webkit-focus-ring-color; }
input.pseudo-focus-visible, textarea.pseudo-focus-visible, select.pseudo-focus-visible { outline-offset: 0; }
input[type="checkbox"].pseudo-focus-visible, input[type="radio"].pseudo-focus-visible { outline-offset: 2px; }
a.pseudo-focus-visible { outline-offset: 1px; }
@media (prefers-color-scheme: dark) {
    button.pseudo-hover, select.pseudo-hover,
    input.pseudo-hover, textarea.pseudo-hover {
        filter: brightness(1.1);
    }
    button.pseudo-active, select.pseudo-active,
    input.pseudo-active, textarea.pseudo-active {
        filter: brightness(0.9);
    }
}
@media (prefers-color-scheme: light) {
    button.pseudo-hover, select.pseudo-hover,
    input.pseudo-hover, textarea.pseudo-hover {
        filter: brightness(0.9);
    }
    button.pseudo-active, select.pseudo-active,
    input.pseudo-active, textarea.pseudo-active {
        filter: brightness(1.1);
    }
}
`

const PSEUDO_RE = /:(?:hover|focus-visible|focus-within|focus(?!-)|active)\b/g
const PSEUDO_RE_TEST = /:(?:hover|focus-visible|focus-within|focus(?!-)|active)\b/

function rewritePseudoClasses(css: string): string {
    let sheet: CSSStyleSheet
    try {
        sheet = new CSSStyleSheet()
        sheet.replaceSync(css)
    } catch {
        return ''
    }
    const out: string[] = []
    collectRewrittenRules(sheet.cssRules, out)
    return out.join('\n')
}

function collectRewrittenRules(rules: CSSRuleList, out: string[]): void {
    for (let i = 0; i < rules.length; i++) {
        const rule = rules[i]
        if (rule instanceof CSSStyleRule) {
            if (PSEUDO_RE_TEST.test(rule.selectorText)) {
                const newSelector = rule.selectorText.replace(PSEUDO_RE, m =>
                    '.pseudo-' + m.slice(1),
                )
                out.push(`${newSelector} { ${rule.style.cssText} }`)
            }
        } else if ('cssRules' in rule) {
            const group = rule as CSSGroupingRule
            const inner: string[] = []
            collectRewrittenRules(group.cssRules, inner)
            if (inner.length) {
                let condText = ''
                if (rule instanceof CSSMediaRule) condText = `@media ${rule.conditionText}`
                else if (rule instanceof CSSSupportsRule) condText = `@supports ${rule.conditionText}`
                else condText = (rule as any).cssText?.split('{')[0]?.trim() ?? ''
                if (condText) out.push(`${condText} {\n${inner.join('\n')}\n}`)
            }
        }
    }
}

function escapeXmlAttr(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function writeDynamicStateInline(src: HTMLElement, dst: HTMLElement) {
    if (src.scrollLeft !== 0 || src.scrollTop !== 0) {
        dst.style.setProperty('--scroll-left', -src.scrollLeft + 'px')
        dst.style.setProperty('--scroll-top', -src.scrollTop + 'px')
    }

    const animations = src.getAnimations()
    if (animations.length !== 1) return
    const anim = animations[0]
    const timeMs = typeof anim.currentTime === 'number' ? anim.currentTime : 0
    const delayStr = getComputedStyle(src).animationDelay
    const delaySec = delayStr.endsWith('ms')
        ? parseFloat(delayStr) / 1000
        : parseFloat(delayStr)
    const adjustedDelaySec = (delaySec || 0) - timeMs / 1000
    dst.style.setProperty('--animation-delay', adjustedDelaySec + 's')
}

const MIRROR_PROPS = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'textTransform',
    'whiteSpace', 'wordWrap', 'overflowWrap', 'wordBreak',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'boxSizing', 'width', 'direction', 'textAlign',
] as const

let mirrorDiv: HTMLDivElement | null = null

/** Measure pixel position of a character index within an input or textarea using a mirror div. */
function measureCharPosition(
    el: HTMLInputElement | HTMLTextAreaElement,
    charIndex: number,
): {x: number; y: number; height: number} {
    if (!mirrorDiv) {
        mirrorDiv = document.createElement('div')
        mirrorDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;overflow:hidden;'
        document.body.appendChild(mirrorDiv)
    }

    const cs = getComputedStyle(el)
    const isInput = el instanceof HTMLInputElement

    // Copy text-affecting styles to mirror
    for (const prop of MIRROR_PROPS) mirrorDiv.style[prop as any] = cs[prop as any]
    mirrorDiv.style.whiteSpace = isInput ? 'pre' : cs.whiteSpace
    mirrorDiv.style.height = 'auto'
    mirrorDiv.style.overflowY = 'hidden'

    const text = el.value
    const before = text.substring(0, charIndex)

    // Insert text before caret, then a marker span
    mirrorDiv.textContent = ''
    const textNode = document.createTextNode(before)
    const marker = document.createElement('span')
    marker.textContent = '|'
    mirrorDiv.appendChild(textNode)
    mirrorDiv.appendChild(marker)
    // Add remaining text for correct wrapping context
    mirrorDiv.appendChild(document.createTextNode(text.substring(charIndex) || '.'))

    const fontSize = parseFloat(cs.fontSize)
    const lhParsed = parseFloat(cs.lineHeight)
    const lineHeight = isNaN(lhParsed) ? fontSize * 1.2
        : cs.lineHeight.endsWith('px') ? lhParsed
        : lhParsed * fontSize

    return {
        x: marker.offsetLeft,
        y: marker.offsetTop,
        height: lineHeight,
    }
}

function injectCaretAndSelection(rootSrc: HTMLElement, rootDst: HTMLElement) {
    const active = document.activeElement
    if (!active) return

    let inputEl: HTMLInputElement | HTMLTextAreaElement
    if (active instanceof HTMLInputElement) {
        const t = active.type
        if (t !== 'text' && t !== 'search' && t !== 'url' && t !== 'tel' && t !== 'password' && t !== '') return
        inputEl = active
    } else if (active instanceof HTMLTextAreaElement) {
        inputEl = active
    } else {
        return
    }

    if (!rootSrc.contains(inputEl)) return
    const selStart = inputEl.selectionStart
    const selEnd = inputEl.selectionEnd
    if (selStart === null || selEnd === null) return

    const cs = getComputedStyle(inputEl)
    const borderLeft = parseFloat(cs.borderLeftWidth) || 0
    const borderTop = parseFloat(cs.borderTopWidth) || 0

    // Walk offsetParent chain to get position in layout space relative to rootSrc
    let offsetX = 0, offsetY = 0
    let el: HTMLElement | null = inputEl
    while (el && el !== rootSrc) {
        offsetX += el.offsetLeft
        offsetY += el.offsetTop
        el = el.offsetParent as HTMLElement | null
    }

    const contentOriginX = offsetX + borderLeft
    const contentOriginY = offsetY + borderTop

    // Clip bounds (visible content area)
    const clipLeft = contentOriginX
    const clipRight = clipLeft + inputEl.clientWidth
    const clipTop = contentOriginY
    const clipBottom = clipTop + inputEl.clientHeight

    if (selStart === selEnd) {
        // Caret
        const pos = measureCharPosition(inputEl, selStart)
        const caretX = contentOriginX + pos.x - inputEl.scrollLeft
        const caretY = contentOriginY + pos.y - inputEl.scrollTop

        const caretVisible = Math.floor(Date.now() / 500) % 2 === 0
        if (caretVisible && caretX >= clipLeft && caretX <= clipRight
            && caretY >= clipTop && caretY + pos.height <= clipBottom) {
            const caret = document.createElement('div')
            caret.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
            caret.style.cssText =
                `position:absolute;pointer-events:none;` +
                `left:${caretX}px;top:${caretY}px;` +
                `width:2px;height:${pos.height}px;` +
                `background:currentColor;`
            rootDst.appendChild(caret)
        }
    } else {
        // Selection — may span multiple lines
        const startPos = measureCharPosition(inputEl, selStart)
        const endPos = measureCharPosition(inputEl, selEnd)

        const lineHeight = startPos.height
        const scrollL = inputEl.scrollLeft
        const scrollT = inputEl.scrollTop

        if (startPos.y === endPos.y) {
            // Single-line selection
            const left = Math.max(contentOriginX + startPos.x - scrollL, clipLeft)
            const right = Math.min(contentOriginX + endPos.x - scrollL, clipRight)
            const top = contentOriginY + startPos.y - scrollT
            if (right > left && top >= clipTop && top + lineHeight <= clipBottom) {
                const highlight = document.createElement('div')
                highlight.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
                highlight.style.cssText =
                    `position:absolute;pointer-events:none;` +
                    `left:${left}px;top:${top}px;` +
                    `width:${right - left}px;height:${lineHeight}px;` +
                    `background:Highlight;opacity:0.5;`
                rootDst.appendChild(highlight)
            }
        } else {
            // Multi-line selection: first line, middle lines, last line
            const lines: {left: number; right: number; top: number}[] = []
            // First line: from selStart to end of line
            lines.push({left: contentOriginX + startPos.x - scrollL, right: clipRight, top: contentOriginY + startPos.y - scrollT})
            // Middle full lines
            for (let y = startPos.y + lineHeight; y < endPos.y; y += lineHeight) {
                lines.push({left: clipLeft, right: clipRight, top: contentOriginY + y - scrollT})
            }
            // Last line: from start of line to selEnd
            lines.push({left: clipLeft, right: contentOriginX + endPos.x - scrollL, top: contentOriginY + endPos.y - scrollT})

            for (const line of lines) {
                const left = Math.max(line.left, clipLeft)
                const right = Math.min(line.right, clipRight)
                if (right <= left) continue
                if (line.top + lineHeight < clipTop || line.top > clipBottom) continue
                const highlight = document.createElement('div')
                highlight.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
                highlight.style.cssText =
                    `position:absolute;pointer-events:none;` +
                    `left:${left}px;top:${line.top}px;` +
                    `width:${right - left}px;height:${lineHeight}px;` +
                    `background:Highlight;opacity:0.5;`
                rootDst.appendChild(highlight)
            }
        }
    }
}

function injectPageSelection(rootSrc: HTMLElement, rootDst: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return

    // Check if selection intersects our element
    const range = selection.getRangeAt(0)
    if (!rootSrc.contains(range.startContainer) && !rootSrc.contains(range.endContainer)) return

    // Temporarily remove 3D transform so getBoundingClientRect/getClientRects
    // return flat layout-space coordinates, not perspective-distorted ones.
    const savedTransform = rootSrc.style.transform
    const savedTransformOrigin = rootSrc.style.transformOrigin
    rootSrc.style.transform = 'none'
    rootSrc.style.transformOrigin = ''

    const rootRect = rootSrc.getBoundingClientRect()
    const scaleX = rootSrc.offsetWidth / rootRect.width
    const scaleY = rootSrc.offsetHeight / rootRect.height

    // Clip to visible area
    const clipRight = rootSrc.offsetWidth
    const clipBottom = rootSrc.offsetHeight

    const rects = range.getClientRects()
    // Collect rect data before restoring transform
    const rectData: {left: number; top: number; width: number; height: number}[] = []
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i]
        rectData.push({
            left: (r.left - rootRect.left) * scaleX + rootSrc.scrollLeft,
            top: (r.top - rootRect.top) * scaleY + rootSrc.scrollTop,
            width: r.width * scaleX,
            height: r.height * scaleY,
        })
    }

    // Restore transform immediately
    rootSrc.style.transform = savedTransform
    rootSrc.style.transformOrigin = savedTransformOrigin

    for (let i = 0; i < rectData.length; i++) {
        let {left, top, width, height} = rectData[i]

        // Clip to element bounds
        if (left < 0) { width += left; left = 0 }
        if (top < 0) { height += top; top = 0 }
        if (left + width > clipRight) width = clipRight - left
        if (top + height > clipBottom) height = clipBottom - top
        if (width <= 0 || height <= 0) continue

        const highlight = document.createElement('div')
        highlight.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
        highlight.style.cssText =
            `position:absolute;pointer-events:none;` +
            `left:${left}px;top:${top}px;` +
            `width:${width}px;height:${height}px;` +
            `background:Highlight;opacity:0.5;`
        rootDst.appendChild(highlight)
    }
}

function freezeResolvedTextMetrics(src: HTMLElement, dst: HTMLElement) {
    const srcAll = [src, ...src.querySelectorAll<HTMLElement>('*')]
    const dstAll = [dst, ...dst.querySelectorAll<HTMLElement>('*')]
    if (srcAll.length !== dstAll.length) return
    for (let i = 0; i < srcAll.length; i++) {
        const cs = getComputedStyle(srcAll[i])
        // Floor all fractional vertical dimensions to prevent cumulative
        // sub-pixel drift in SVG-as-image rasterization
        for (const prop of ['fontSize', 'lineHeight', 'height', 'minHeight', 'maxHeight', 'marginTop', 'marginBottom', 'paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'] as const) {
            const v = parseFloat(cs[prop])
            if (isNaN(v)) continue
            dstAll[i].style[prop] = (v % 1 !== 0) ? Math.floor(v) + 'px' : cs[prop]
        }
    }
}


const dataUrlCache = new Map<string, Promise<string>>()

function fetchAsDataUrl(url: string): Promise<string> {
    const cached = dataUrlCache.get(url)
    if (cached) return cached
    const p = fetch(url)
        .then(r => {
            if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`)
            return r.blob()
        })
        .then(blob => new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.onerror = () => reject(fr.error)
            fr.readAsDataURL(blob)
        }))
    dataUrlCache.set(url, p)
    p.catch(() => {
        if (dataUrlCache.get(url) === p) dataUrlCache.delete(url)
    })
    return p
}

async function inlineExternalImages(root: HTMLElement): Promise<void> {
    const imgs = Array.from(root.querySelectorAll('img'))
    await Promise.all(imgs.map(async img => {
        const src = img.getAttribute('src')
        if (!src || src.startsWith('data:')) return
        try {
            const abs = new URL(src, document.baseURI).href
            img.setAttribute('src', await fetchAsDataUrl(abs))
        } catch (e) {
            console.warn('[HtmlRenderer] failed to inline img', src, e)
            img.removeAttribute('src')
        }
    }))
}
