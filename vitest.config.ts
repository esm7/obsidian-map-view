import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import type { Plugin } from 'vite';

// Handle .css imports in tests by returning an empty module.
// Needed because source files import CSS from leaflet plugins directly.
function mockCssPlugin(): Plugin {
    return {
        name: 'mock-css',
        resolveId(id: string) {
            if (id.endsWith('.css')) return id;
        },
        load(id: string) {
            if (id.endsWith('.css')) return 'export default {}';
        },
    };
}

export default defineConfig({
    plugins: [mockCssPlugin()],
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.ts'],
    },
    resolve: {
        alias: [
            // Obsidian API — not available outside the Obsidian app
            {
                find: 'obsidian',
                replacement: resolve(__dirname, 'tests/__mocks__/obsidian.ts'),
            },
            // Leaflet plugins with DOM/global side effects — not needed for unit tests
            {
                find: 'leaflet-extra-markers',
                replacement: resolve(
                    __dirname,
                    'tests/__mocks__/leaflet-extra-markers.ts',
                ),
            },
            {
                find: /^leaflet-extra-markers\/.*/,
                replacement: resolve(__dirname, 'tests/__mocks__/empty.ts'),
            },
            {
                find: '@geoman-io/leaflet-geoman-free',
                replacement: resolve(__dirname, 'tests/__mocks__/empty.ts'),
            },
            {
                find: /^@geoman-io\/leaflet-geoman-free\/.*/,
                replacement: resolve(__dirname, 'tests/__mocks__/empty.ts'),
            },
            // Resolve 'src' prefix to the src directory
            { find: 'src', replacement: resolve(__dirname, 'src') },
        ],
    },
});
