// Shared base ESLint flat config for Node.js / TypeScript repos.
// Composes: @eslint/js recommended + typescript-eslint recommended + Prettier
// (formatting surfaced as warnings, not errors). Import and spread to extend:
//
//   import base from 'devkit/eslint/base';
//   export default [...base, { rules: { 'no-console': 'off' } }];

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

/** Shared rules applied to JS/TS source files. Reused by the `next` preset. */
export const sharedRules = {
  'prettier/prettier': 'warn',
  // Prefer the TS-aware unused-vars rule (the base rule mis-flags type params).
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'warn',
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
};

/** Directories that should never be linted. */
export const sharedIgnores = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
];

export default tseslint.config(
  { ignores: sharedIgnores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig, // turn off ESLint rules that conflict with Prettier
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: { prettier: prettierPlugin },
    rules: sharedRules,
  }
);
