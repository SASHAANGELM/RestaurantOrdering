import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Serve the actual optimized Angular output, with same-origin HTTP/socket proxying. */
export default defineConfig({
  build: { outDir: resolve('dist/apps/frontend/browser') },
  preview: {
    host: '127.0.0.1', port: 4200, strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env['E2E_BACKEND_PORT'] ?? 3000}` },
      '/socket.io': { target: `http://127.0.0.1:${process.env['E2E_BACKEND_PORT'] ?? 3000}`, ws: true }
    }
  }
});
