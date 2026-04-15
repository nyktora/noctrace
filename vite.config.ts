import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4117',
      '/ws': {
        target: 'ws://localhost:4117',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist/client',
  },
  test: {
    // Include both .ts and .tsx test files
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Client-side component tests run in a browser-like DOM environment.
    // Files under tests/client/ use happy-dom; server/shared tests keep the
    // default (node) environment.
    environmentMatchGlobs: [
      ['tests/client/**', 'happy-dom'],
    ],
    globals: false,
    setupFiles: ['tests/client/setup.ts'],
  },
});
