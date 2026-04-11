import {resolve} from 'node:path'
import {defineConfig} from 'vite'

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist-demo',
        target: 'esnext',
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                'text-input': resolve(__dirname, 'examples/text-input.html'),
                'webGL': resolve(__dirname, 'examples/webGL.html'),
                'webGL-text-input': resolve(__dirname, 'examples/webGL-text-input.html'),
                'complex-text': resolve(__dirname, 'examples/complex-text.html'),
                'pie-chart': resolve(__dirname, 'examples/pie-chart.html'),
                'uninstall-test': resolve(__dirname, 'examples/uninstall-test.html'),
                'jelly-slider': resolve(__dirname, 'examples/webgpu-jelly-slider/index.html'),
                'privacy-policy': resolve(__dirname, 'extension/privacy-policy.html'),
            },
        },
    },
})
