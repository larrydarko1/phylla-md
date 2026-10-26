import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';

export default defineConfig({
    main: {
        resolve: {
            alias: {
                '@/main': fileURLToPath(new URL('./src/main', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/main/index.ts'),
                },
            },
        },
    },
    preload: {
        resolve: {
            alias: {
                '@/preload': fileURLToPath(new URL('./src/preload', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/preload/index.ts'),
                },
                // CommonJS + .cjs: a sandboxed preload cannot be ESM, and "type": "module" would
                // make a plain .js one.
                output: {
                    format: 'cjs',
                    entryFileNames: 'index.cjs',
                },
            },
        },
    },
    renderer: {
        plugins: [vue()],
        resolve: {
            alias: {
                '@/renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
                '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            },
        },
        css: {
            preprocessorOptions: {
                scss: {
                    loadPaths: [fileURLToPath(new URL('./src/renderer/styles', import.meta.url))],
                    additionalData: (source: string, filename: string) =>
                        /[/\\]styles[/\\]/.test(filename)
                            ? source
                            : `@use 'sass:color';\n@use '@/renderer/styles/variables' as *;\n${source}`,
                },
            },
        },
        base: './',
        root: resolve(__dirname, 'src/renderer'),
        server: {
            port: 3000,
            strictPort: true,
        },
        build: {
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html'),
                },
            },
        },
    },
});
