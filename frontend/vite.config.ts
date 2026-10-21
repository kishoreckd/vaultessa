/// <reference types="vitest/config" />
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    port: 5173,
    // Same-origin API in dev so the SameSite=Strict refresh cookie works.
    // 8010 (not 8000) so Vaultessa can run next to other local FastAPI apps.
    // 127.0.0.1, not localhost: Node may resolve localhost to ::1 while uvicorn listens on IPv4.
    proxy: { '/api': 'http://127.0.0.1:8010' },
  },
  build: { sourcemap: false },
  test: { environment: 'node' },
});
