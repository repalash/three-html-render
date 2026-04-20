import {readFileSync, existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'vite'

// ─────────────────────────────────────────────────────────────────────────
// Read every <script type="importmap"> block in the input HTML files and
// use them as Vite's resolver. The HTML importmap is the single source of
// truth for bare-specifier → URL mappings — dev server, build, and the
// browser at runtime all agree.
//
// Vite has no native importmap support (vitejs/vite#2483). Without this
// plugin, `import … from 'three'` fails at resolve time because `three`
// isn't in node_modules.
//
// Per-HTML resolution so demos can pin different versions (e.g. the
// legacy demo uses three@0.164 to exercise the HTMLTexture fallback):
//   - Inline scripts use their own HTML's importmap (direct path match).
//   - Shared /src/ modules imported with a `?v=<name>` query string are
//     routed to the HTML whose filename contains <name>.
//   - Everything else uses the default (the main/index HTML's) importmap.
// ─────────────────────────────────────────────────────────────────────────

const inputHtmls: Record<string, string> = {
    main: resolve(__dirname, 'index.html'),
    'text-input': resolve(__dirname, 'examples/text-input.html'),
    'webGL': resolve(__dirname, 'examples/webGL.html'),
    'webGL-text-input': resolve(__dirname, 'examples/webGL-text-input.html'),
    'complex-text': resolve(__dirname, 'examples/complex-text.html'),
    'pie-chart': resolve(__dirname, 'examples/pie-chart.html'),
    'uninstall-test': resolve(__dirname, 'examples/uninstall-test.html'),
    'jelly-slider': resolve(__dirname, 'examples/webgpu-jelly-slider/index.html'),
    'webxr-vr': resolve(__dirname, 'examples/webxr-vr.html'),
    'webxr-ar': resolve(__dirname, 'examples/webxr-ar.html'),
    'focus-ring': resolve(__dirname, 'examples/focus-ring.html'),
    'three-dragon': resolve(__dirname, 'examples/three-dragon.html'),
    'three-html': resolve(__dirname, 'examples/three-html.html'),
    'three-html-raycast': resolve(__dirname, 'examples/three-html-raycast.html'),
    'three-html-legacy': resolve(__dirname, 'examples/three-html-legacy.html'),
    'three-html-webgpu': resolve(__dirname, 'examples/three-html-webgpu.html'),
    'three-html-webgpu-raycast': resolve(__dirname, 'examples/three-html-webgpu-raycast.html'),
    'privacy-policy': resolve(__dirname, 'extension/privacy-policy.html'),
}

function readImportmapsFromHtml(path: string): Record<string, string> {
    if (!existsSync(path)) return {}
    const html = readFileSync(path, 'utf8')
    const merged: Record<string, string> = {}
    for (const m of html.matchAll(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            const parsed = JSON.parse(m[1])
            if (parsed?.imports) Object.assign(merged, parsed.imports)
        } catch { /* skip malformed */ }
    }
    return merged
}

const perHtml: Record<string, Record<string, string>> = {}
for (const p of Object.values(inputHtmls)) {
    const m = readImportmapsFromHtml(p)
    if (Object.keys(m).length) perHtml[p] = m
}
const defaultMap = perHtml[inputHtmls.main] || perHtml[inputHtmls['three-html']] || {}

function pickMap(importer?: string): Record<string, string> {
    if (!importer) return defaultMap
    const [path, query = ''] = importer.split('?')
    if (perHtml[path]) return perHtml[path]
    // `?v=<name>` query lets shared /src/ modules target a specific HTML
    // (the legacy demo uses `?v=legacy` to route its copy of /src/ imports
    // to the importmap in three-html-legacy.html).
    const v = query.split('&').find(p => p.startsWith('v='))?.slice(2)
    if (v) {
        for (const [htmlPath, map] of Object.entries(perHtml)) {
            if (htmlPath.includes(v)) return map
        }
    }
    return defaultMap
}

function resolveWithMap(id: string, map: Record<string, string>): string | null {
    if (map[id]) return map[id]
    for (const [key, url] of Object.entries(map)) {
        if (key.endsWith('/') && id.startsWith(key)) return url + id.slice(key.length)
    }
    return null
}

const htmlImportmapPlugin = {
    name: 'html-importmap-sync',
    enforce: 'pre' as const,
    resolveId(id: string, importer?: string) {
        const map = pickMap(importer)
        const url = resolveWithMap(id, map)
        if (url) return {id: url, external: true}
        return null
    },
}

export default defineConfig({
    base: './',
    plugins: [htmlImportmapPlugin],
    build: {
        outDir: 'dist-demo',
        target: 'esnext',
        rollupOptions: {
            input: inputHtmls,
        },
    },
})
