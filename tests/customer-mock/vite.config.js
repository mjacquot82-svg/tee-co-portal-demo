import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Real application and SDK; synthetic loopback destination, never a Supabase project.
export default defineConfig({
  envDir: path.resolve('tests/customer-mock'),
  envPrefix: 'CUSTOMER_MOCK_',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:4191'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-test-key-not-a-credential'),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(''),
  },
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4191, strictPort: true, proxy: {}, hmr: false, watch: null,
    headers: { 'Content-Security-Policy': "connect-src 'self'; img-src 'self' data: blob:; form-action 'none'" } },
});
