import {resolve} from 'node:path'
import {defineConfig} from 'vite'
import license from 'rollup-plugin-license'
import packageJson from './package.json' with { type: 'json' }

const {name, version, author} = packageJson

export default defineConfig({
    build: {
        lib: {
            entry: resolve(__dirname, 'src/extensionEntry.ts'),
            formats: ['iife'],
            name: 'HtmlInCanvasPolyfill',
            fileName: () => 'polyfill.js',
        },
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        copyPublicDir: false,
        minify: true,
    },
    plugins: [
        license({
            banner: `
        @license
        ${name} v${version}
        Copyright 2025<%= moment().format('YYYY') > 2025 ? '-' + moment().format('YYYY') : '' %> ${author}
        ${packageJson.license} License
      `,
        }),
    ],
})
