import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const fixture = path.resolve('tests/artwork-browser');
const mocks = new Set(['productsStore', 'ordersStore', 'customerProfileStore', 'customersStore', 'customerArtworkService', 'customerSessionStore', 'catalogLookupsStore', 'useCustomerPortalData', 'supabaseClient']);
export default defineConfig({
  envDir: fixture,
  envPrefix: 'ARTWORK_BROWSER_',
  plugins: [{ name: 'isolated-artwork-services', enforce: 'pre', resolveId(source) {
    if (source === '/src/main.jsx') return path.join(fixture, 'main.jsx');
    const name = source.split('/').at(-1).replace(/\.(jsx?|tsx?)$/, '');
    if (mocks.has(name)) return path.join(fixture, 'services.js');
  } }, react()],
  server: { host: '127.0.0.1', port: 4187, strictPort: true, proxy: {}, hmr: false, watch: null,
    headers: { 'Content-Security-Policy': "connect-src 'self'; img-src 'self' data: blob:; form-action 'none'" } },
});

