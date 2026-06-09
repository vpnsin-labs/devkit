#!/usr/bin/env node
// ladevconfig CLI — scaffolds shared lint/format/commit/CI/release tooling into
// a Node.js or Next.js repo. Configs that CAN reference the package (ESLint,
// Prettier, commitlint, lint-staged) are written as thin shims so they stay in
// sync; files that CANNOT be referenced (Husky hooks, GitHub workflows, VS Code
// settings, PR template, release-please config) are copied as templates.
//
// Usage:
//   npx ladevconfig init [--node|--next] [--force] [--no-install]

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = resolve(HERE, '..', 'templates');
const CWD = process.cwd();

const argv = process.argv.slice(2);
const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'init';
const has = (flag) => argv.includes(flag);

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = {
  add: (p) => console.log(`  ${c.green('+')} ${p}`),
  skip: (p) => console.log(`  ${c.dim('•')} ${c.dim(`${p} (exists, left as-is)`)}`),
  edit: (p) => console.log(`  ${c.cyan('~')} ${p}`),
  info: (m) => console.log(`  ${c.dim(m)}`),
};

if (cmd === 'help' || has('-h') || has('--help')) {
  console.log(`
${c.bold('ladevconfig')} — shared Node.js/Next.js dev config

${c.bold('Usage:')}  npx ladevconfig init [options]

${c.bold('Options:')}
  --next         force the Next.js ESLint preset
  --node         force the base (Node) ESLint preset
  --scorecard    also add the OSSF Scorecard workflow (public repos)
  --publish      also add the npm publish-on-release workflow (needs NPM_TOKEN)
  --force        overwrite existing config/template files
  --no-install   skip installing dev dependencies
  -h, --help     show this help
`);
  process.exit(0);
}

if (cmd !== 'init') {
  console.error(`Unknown command "${cmd}". Run: npx ladevconfig --help`);
  process.exit(1);
}

// ── Load the consumer package.json ──────────────────────────────────────────
const pkgPath = join(CWD, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('No package.json found in the current directory. Run this inside a Node project.');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

const isNext = has('--next') ? true : has('--node') ? false : Boolean(allDeps.next);
const force = has('--force');

console.log(`\n${c.bold('ladevconfig init')} ${c.dim(`(${isNext ? 'Next.js' : 'Node'} preset)`)}\n`);

// ── Helpers ─────────────────────────────────────────────────────────────────
function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function copyTemplate(rel, dest, { executable = false } = {}) {
  const target = join(CWD, dest);
  if (existsSync(target) && !force) return log.skip(dest);
  ensureDir(target);
  copyFileSync(join(TEMPLATES, rel), target);
  if (executable) {
    try {
      chmodSync(target, 0o755);
    } catch {
      /* chmod is a no-op / unsupported on some platforms */
    }
  }
  log.add(dest);
}

function writeFileIfAbsent(dest, content) {
  const target = join(CWD, dest);
  if (existsSync(target) && !force) return log.skip(dest);
  ensureDir(target);
  writeFileSync(target, content);
  log.add(dest);
}

// ── 1. Config shims (kept in sync with the package) ─────────────────────────
console.log(c.bold('Config shims'));
const eslintPreset = isNext ? 'ladevconfig/eslint/next' : 'ladevconfig/eslint/base';
writeFileIfAbsent('eslint.config.mjs', `export { default } from '${eslintPreset}';\n`);
writeFileIfAbsent('commitlint.config.mjs', `export { default } from 'ladevconfig/commitlint';\n`);
writeFileIfAbsent('.lintstagedrc.mjs', `export { default } from 'ladevconfig/lint-staged';\n`);

// ── 2. Copied templates ─────────────────────────────────────────────────────
console.log(c.bold('\nEditor & hooks'));
copyTemplate('husky/pre-commit', '.husky/pre-commit', { executable: true });
copyTemplate('husky/commit-msg', '.husky/commit-msg', { executable: true });
copyTemplate('vscode/settings.json', '.vscode/settings.json');
copyTemplate('vscode/extensions.json', '.vscode/extensions.json');
copyTemplate('markdownlint-cli2.jsonc', '.markdownlint-cli2.jsonc');

console.log(c.bold('\nGitHub workflows'));
copyTemplate('github/workflows/ci.yml', '.github/workflows/ci.yml');
copyTemplate('github/workflows/codeql.yml', '.github/workflows/codeql.yml');
copyTemplate('github/workflows/dependency-review.yml', '.github/workflows/dependency-review.yml');
copyTemplate('github/workflows/trivy.yml', '.github/workflows/trivy.yml');
copyTemplate('github/workflows/release-please.yml', '.github/workflows/release-please.yml');
copyTemplate('release-please-config.json', 'release-please-config.json');
writeFileIfAbsent('.release-please-manifest.json', `${JSON.stringify({ '.': pkg.version || '0.0.0' }, null, 2)}\n`);
if (has('--scorecard')) {
  copyTemplate('github/workflows/scorecard.yml', '.github/workflows/scorecard.yml');
}
if (has('--publish')) {
  copyTemplate('github/workflows/publish.yml', '.github/workflows/publish.yml');
}

console.log(c.bold('\nGovernance & docs'));
copyTemplate('github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md');
copyTemplate('github/SECURITY.md', '.github/SECURITY.md');
copyTemplate('github/CONTRIBUTING.md', '.github/CONTRIBUTING.md');
copyTemplate('github/CODEOWNERS', '.github/CODEOWNERS');
copyTemplate('github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/bug_report.yml');
copyTemplate('github/ISSUE_TEMPLATE/feature_request.yml', '.github/ISSUE_TEMPLATE/feature_request.yml');
copyTemplate('github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/config.yml');
copyTemplate('README.template.md', 'README.md'); // only if absent (never clobbers)

// ── 3. Merge package.json (scripts, prettier key) ───────────────────────────
console.log(c.bold('\npackage.json'));
const scripts = {
  lint: 'eslint .',
  'lint:fix': 'eslint . --fix',
  'lint:md': 'markdownlint-cli2',
  format: 'prettier --write .',
  'format:check': 'prettier --check .',
  'type-check': 'tsc --noEmit',
  prepare: 'husky',
};
pkg.scripts ??= {};
let changed = false;
for (const [k, v] of Object.entries(scripts)) {
  if (!pkg.scripts[k]) {
    pkg.scripts[k] = v;
    changed = true;
    log.add(`scripts.${k}`);
  } else {
    log.skip(`scripts.${k}`);
  }
}
if (!pkg.prettier) {
  pkg.prettier = 'ladevconfig/prettier';
  changed = true;
  log.add('prettier');
} else {
  log.skip('prettier');
}
if (changed) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// ── 4. Install dev dependencies ─────────────────────────────────────────────
const devDeps = [
  'ladevconfig',
  'eslint',
  'prettier',
  'husky',
  'lint-staged',
  '@commitlint/cli',
  'markdownlint-cli2',
  'typescript',
  ...(isNext ? ['eslint-config-next'] : []),
];

if (has('--no-install')) {
  console.log(c.bold('\nDev dependencies'));
  log.info(`Skipped (--no-install). Install manually:`);
  log.info(`npm i -D ${devDeps.join(' ')}`);
} else {
  console.log(c.bold('\nInstalling dev dependencies…'));
  log.info(`npm i -D ${devDeps.join(' ')}`);
  try {
    execSync(`npm install -D ${devDeps.join(' ')}`, { cwd: CWD, stdio: 'inherit' });
  } catch {
    console.log(c.yellow('\n  ! Install failed — run it manually:'));
    log.info(`npm i -D ${devDeps.join(' ')}`);
  }
}

// ── 5. Initialise Husky ─────────────────────────────────────────────────────
console.log(c.bold('\nHusky'));
try {
  execSync('npx husky', { cwd: CWD, stdio: 'ignore' });
  log.info('git hooks installed (core.hooksPath set)');
} catch {
  log.info('Run "npx husky" once to finish hook installation.');
}

// ── Done ────────────────────────────────────────────────────────────────────
console.log(`\n${c.green('✓ ladevconfig wired up.')}\n`);
console.log(`${c.bold('Next steps:')}`);
console.log(`  1. Fill placeholders: ${c.cyan('.github/CODEOWNERS')} (@OWNER) and the security contact in ${c.cyan('.github/SECURITY.md')}.`);
console.log(`  2. One-time normalise formatting:   ${c.cyan('npm run format')}`);
console.log(`  3. Verify the gates:                ${c.cyan('npm run lint && npm run type-check && npm run lint:md')}`);
console.log(`  4. In GitHub repo settings, enable Code scanning, Secret scanning & Dependency graph.`);
console.log(`  5. Commit with a Conventional Commit ${c.dim('e.g. git commit -m "chore: adopt ladevconfig"')}\n`);
