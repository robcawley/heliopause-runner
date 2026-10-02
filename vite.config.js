import { defineConfig } from 'vite';

// base: './' keeps the production build portable, so dist/ can be dropped
// into any folder on robcawley.com (e.g. /heliopause-runner/) without rewriting paths.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },   // host: true lets a phone on the same Wi-Fi join
  build: {
    target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500,
    // three.js in its own file: it rarely changes, so returning players keep it cached
    // when only the game code updates
    rolldownOptions: { output: { advancedChunks: { groups: [{ name: 'three', test: /node_modules[\/]three/ }] } } },
  },
});
