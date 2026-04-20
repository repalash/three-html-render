import {resolve} from 'node:path'
import {defineConfig} from 'vite'
import dts from 'vite-plugin-dts'
import license from 'rollup-plugin-license'
import packageJson from './package.json' with { type: 'json' }

const {name, version, author} = packageJson

export default defineConfig({
    build: {
        lib: {
            entry: {
                'polyfill.module': resolve(__dirname, 'src/htmlInCanvasPolyfill.ts'),
                renderer: resolve(__dirname, 'src/threeHTMLRenderer.ts'),
                'html-texture': resolve(__dirname, 'src/htmlTexture.ts'),
                'interaction-manager': resolve(__dirname, 'src/interactionManager.ts'),
                'interaction-manager-standalone': resolve(__dirname, 'src/interactionManagerStandalone.ts'),
                'raycast-interaction-manager': resolve(__dirname, 'src/raycastInteractionManager.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => {
                if (entryName === 'polyfill.module') return 'polyfill.mjs'
                return `${entryName}.js`
            },
        },
        rollupOptions: {
            external: [/^three(\/|$)/],
        },
        sourcemap: true,
        copyPublicDir: false,
    },
    plugins: [
        dts({tsconfigPath: './tsconfig.build.json'}),
        license({
            banner: `
        @license
        ${name} v${version}
        Copyright 2025<%= moment().format('YYYY') > 2025 ? '-' + moment().format('YYYY') : '' %> ${author}
        ${packageJson.license} License
        See ./dependencies.txt for bundled third-party dependencies and licenses.
      `,
            thirdParty: {
                output: resolve(__dirname, 'dist', 'dependencies.txt'),
                includePrivate: true,
            },
        }),
    ],
})
