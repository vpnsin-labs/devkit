// Base Vitest config (Node). Wrap with defineConfig in your repo so Vitest's
// types apply:
//   // vitest.config.mjs
//   import { defineConfig } from 'vitest/config';
//   import base from 'devkit/vitest';
//   export default defineConfig(base);
//
// Requires `vitest` and `@vitest/coverage-v8` in the consuming repo (the
// `devkit init --vitest` CLI installs them). For component tests in a
// browser-like DOM, set `test.environment` to 'jsdom' and add the dep.
export default {
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**'],
    },
  },
};
