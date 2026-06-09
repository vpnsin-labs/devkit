// Shared commitlint config — Conventional Commits, which release-please reads
// to compute semantic version bumps and the changelog.
//   // commitlint.config.mjs
//   export { default } from 'devkit/commitlint';
export default {
  extends: ['@commitlint/config-conventional'],
};
