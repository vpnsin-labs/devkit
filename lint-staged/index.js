// Shared lint-staged config — runs on staged files in the pre-commit hook.
//   // .lintstagedrc.mjs
//   export { default } from 'devkit/lint-staged';
export default {
  '*.{ts,tsx,js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,jsonc,css,scss,html,yml,yaml}': ['prettier --write'],
  '*.md': ['markdownlint-cli2 --fix', 'prettier --write'],
};
