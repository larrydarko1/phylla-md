import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '@/main': fileURLToPath(new URL('./src/main', import.meta.url)),
            '@/renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
            '@/schemas': fileURLToPath(new URL('./src/schemas', import.meta.url)),
            '@/preload': fileURLToPath(new URL('./src/preload', import.meta.url)),
            '@test-utils': fileURLToPath(new URL('./tests/renderer/test-utils', import.meta.url)),
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['./vitest.setup.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,vue}'],
            exclude: ['src/renderer/main.ts', 'src/main/index.ts', 'src/**/*.d.ts', 'src/**/*.html'],
            reporter: ['text', 'text-summary', 'html', 'json-summary'],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
});
