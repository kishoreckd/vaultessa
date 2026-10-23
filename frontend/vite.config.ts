/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, ['VITE_', 'DEV_', 'BACKEND_']);
  const apiPath = (env.VITE_API_BASE_PATH || '/api').replace(/\/+$/, '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: 5173,
      // Same-origin API in dev so the SameSite=Strict refresh cookie works.
      // 8010 (not 8000) so Vaultessa can run next to other local FastAPI apps.
      // 127.0.0.1, not localhost: Node may resolve localhost to ::1 while uvicorn listens on IPv4.
      proxy: { [apiPath]: env.BACKEND_URL || env.DEV_API_PROXY_TARGET || 'http://127.0.0.1:8010' },
    },
    build: { sourcemap: false },
    test: { environment: 'node' },
  };
});
