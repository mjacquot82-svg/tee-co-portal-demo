import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Intentionally independent from vite.config.js: no production-function proxy or app env files.
export default defineConfig({
  envDir: path.resolve('tests/ci'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: {}, hmr: false, watch: null },
});
