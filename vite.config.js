import { defineConfig } from 'vite';

// base: './' keeps the production build portable, so dist/ can be dropped
// into any folder on robcawley.com (e.g. /heliopause-runner/) without rewriting paths.
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },   // host: true lets a phone on the same Wi-Fi join
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
