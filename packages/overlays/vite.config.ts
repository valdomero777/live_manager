import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const BACKEND = process.env['TIKLIVE_BACKEND'] ?? 'http://localhost:3000';

export default defineConfig({
  resolve: { conditions: ['development'] },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        audio: resolve(import.meta.dirname, 'screen/audio/index.html'),
        alerts: resolve(import.meta.dirname, 'screen/alerts/index.html'),
        leaderboard: resolve(import.meta.dirname, 'overlay/leaderboard/index.html'),
        goal: resolve(import.meta.dirname, 'overlay/goal/index.html'),
        stats: resolve(import.meta.dirname, 'overlay/stats/index.html'),
        rotator: resolve(import.meta.dirname, 'overlay/rotator/index.html'),
      },
    },
  },
  server: {
    proxy: {
      '/ws': { target: BACKEND.replace(/^http/, 'ws'), ws: true },
      '/media': BACKEND,
      '/api': BACKEND,
    },
  },
});
