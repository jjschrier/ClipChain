import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import inject from '@rollup/plugin-inject';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';
import { NodeModulesPolyfillPlugin } from '@esbuild-plugins/node-modules-polyfill';

const buildVersion = new Date().toISOString();

const versionPlugin = () => ({
    name: 'clipchain-version',
    generateBundle() {
        this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ version: buildVersion }),
        });
    },
});

export default defineConfig({
    // Use absolute asset paths so deep links (/watch/123) work after reload
    base: '/',
    plugins: [react(), versionPlugin()],
    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            '@': path.resolve(__dirname, './src'),
            buffer: 'buffer',
            crypto: 'crypto-browserify',
            stream: 'stream-browserify',

        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            plugins: [
                inject({
                    Buffer: ['buffer', 'Buffer'],
                    process: 'process/browser',
                }),
            ],
        },
    },
    optimizeDeps: {
        include: [
            'firebase/app',
            'firebase/firestore',
            'firebase/auth',
            'firebase/storage',
            '@solana/web3.js',
            '@solana/spl-token',
            '@metaplex-foundation/mpl-token-metadata',
            'react-hot-toast',
        ],
        exclude: ['lucide-react'],
        esbuildOptions: {
            define: {
                global: 'globalThis',
            },
            plugins: [
                NodeGlobalsPolyfillPlugin({
                    process: true,
                    buffer: true,
                }),
                NodeModulesPolyfillPlugin(),
            ],
        },
    },
    define: {
        'process.env': {},
        __APP_VERSION__: JSON.stringify(buildVersion),
    },
});
