// Shared ESLint flat config for Next.js repos = base preset + eslint-config-next.
// `eslint-config-next` is an OPTIONAL peer dependency — install it in the
// consuming Next.js repo (the `devkit init` CLI does this automatically).
//
//   import next from 'devkit/eslint/next';
//   export default next;

import base from './base.js';
import prettierConfig from 'eslint-config-prettier';

let nextConfigs = [];
try {
  const mod = await import('eslint-config-next');
  // eslint-config-next ships a flat-config array (default export).
  nextConfigs = Array.isArray(mod.default) ? mod.default : (mod.default ?? []);
} catch {
  throw new Error(
    "devkit/eslint/next requires 'eslint-config-next'. Install it: npm i -D eslint-config-next"
  );
}

export default [
  ...base,
  ...nextConfigs,
  // Re-apply last so Prettier always wins over any formatting rules Next re-enables.
  prettierConfig,
];
