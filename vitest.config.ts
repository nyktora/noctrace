import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Include both .ts and .tsx test files (server/shared tests + client component tests)
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // Client-side component tests run in a browser-like DOM environment.
    // Server/shared tests keep the default node environment.
    environmentMatchGlobs: [
      ['tests/client/**', 'happy-dom'],
    ],
    // jest-dom matchers need `expect` in scope — only injected into client tests
    // via the @vitest/environment annotation. The setup file is only imported
    // when the environment is happy-dom (matched by environmentMatchGlobs).
    globals: true,
    setupFiles: ['tests/client/setup.ts'],
    // Environment per test file is set via @vitest-environment docblock comment
    environment: 'node',
  },
});
