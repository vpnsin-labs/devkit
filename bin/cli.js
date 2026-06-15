#!/usr/bin/env node
// devkit CLI — scaffolds shared lint/format/commit/CI/release tooling into
// a Node.js or Next.js repo. Configs that CAN reference the package (ESLint,
// Prettier, commitlint, lint-staged) are written as thin shims so they stay in
// sync; files that CANNOT be referenced (Husky hooks, GitHub workflows, VS Code
// settings, PR template, release-please config) are copied as templates.
//
// Usage:
//   npx devkit init [--node|--next] [--force] [--no-install]

import { execSync } from 'node:child_process';
import {
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  constants,
} from 'node:fs';
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
${c.bold('devkit')} — shared Node.js/Next.js dev config

${c.bold('Usage:')}  npx devkit init [options]

${c.bold('Options:')}
  --next         force the Next.js ESLint preset
  --node         force the base (Node) ESLint preset
  --private      private repo: skip GHAS workflows (Dependabot + npm audit instead)
  --public       public repo: include GHAS workflows (default; auto-detected via gh)
  --backend      scaffold a runnable Express + TypeScript backend (src/, Dockerfile)
  --frontend     scaffold a runnable Next.js (App Router) + TypeScript frontend
  --jest         also scaffold Jest (ts-jest) config, scripts and deps
  --vitest       also scaffold Vitest config, scripts and deps
  --scorecard    also add the OSSF Scorecard workflow (public repos)
  --publish      auto-publish to npm when the release-please PR merges (needs NPM_TOKEN)
  --sonar        also add SonarCloud analysis (needs SONAR_TOKEN)
  --lighthouse   also add a Lighthouse CI workflow (web apps)
  --skills       also add Claude Code skills (e.g. design-craft for UI/UX)
  --force        overwrite existing config/template files
  --no-install   skip installing dev dependencies
  -h, --help     show this help
`);
  process.exit(0);
}

if (cmd !== 'init') {
  console.error(`Unknown command "${cmd}". Run: npx devkit --help`);
  process.exit(1);
}

// ── Load the consumer package.json ──────────────────────────────────────────
const pkgPath = join(CWD, 'package.json');
let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      'No package.json found in the current directory. Run this inside a Node project.'
    );
    process.exit(1);
  }
  throw err;
}
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

// App starters (opt-in): scaffold a runnable skeleton, not just tooling config.
const wantsBackend = has('--backend');
const wantsFrontend = has('--frontend');
if (wantsBackend && wantsFrontend) {
  console.error(
    '--backend and --frontend scaffold a single flat app each; run them in separate directories (or set up a monorepo) instead of combining them.'
  );
  process.exit(1);
}

// --frontend implies the Next.js preset; --backend implies the Node preset.
const isNext = has('--next')
  ? true
  : has('--node')
    ? false
    : wantsFrontend
      ? true
      : wantsBackend
        ? false
        : Boolean(allDeps.next);
const force = has('--force');

// GHAS code scanning (CodeQL/Trivy/Dependency Review/Scorecard) is free only on
// PUBLIC repos; private repos need a paid licence. Honour --private/--public, or
// best-effort auto-detect via the gh CLI (defaults to public if we can't tell).
function detectPrivate() {
  if (has('--public')) return false;
  if (has('--private')) return true;
  try {
    const out = execSync('gh repo view --json visibility -q .visibility', {
      cwd: CWD,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return out === 'PRIVATE';
  } catch {
    return false;
  }
}
const isPrivate = detectPrivate();

console.log(
  `\n${c.bold('devkit init')} ${c.dim(`(${isNext ? 'Next.js' : 'Node'} preset, ${isPrivate ? 'private' : 'public'} repo)`)}\n`
);

// ── Helpers ─────────────────────────────────────────────────────────────────
function ensureDir(file) {
  mkdirSync(dirname(file), { recursive: true });
}

function copyTemplate(rel, dest, { executable = false } = {}) {
  const target = join(CWD, dest);
  ensureDir(target);
  try {
    // COPYFILE_EXCL fails atomically (EEXIST) if the target exists — this avoids
    // the check-then-write race of a separate existsSync() guard.
    copyFileSync(join(TEMPLATES, rel), target, force ? 0 : constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === 'EEXIST') return log.skip(dest);
    throw err;
  }
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
  ensureDir(target);
  try {
    // The 'wx' flag fails atomically (EEXIST) if the file exists — this avoids
    // the check-then-write race of a separate existsSync() guard.
    writeFileSync(target, content, { flag: force ? 'w' : 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return log.skip(dest);
    throw err;
  }
  log.add(dest);
}

function ensureGitignoreEntry(entry) {
  const target = join(CWD, '.gitignore');
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (current.split('\n').some((l) => l.trim() === entry)) {
    return log.skip(`.gitignore (${entry} already present)`);
  }
  const sep = current && !current.endsWith('\n') ? '\n' : '';
  writeFileSync(target, `${current}${sep}${entry}\n`);
  log.edit(`.gitignore (+${entry})`);
}

// ── 1. Config shims (kept in sync with the package) ─────────────────────────
console.log(c.bold('Config shims'));
const eslintPreset = isNext ? '@vpnsin/devkit/eslint/next' : '@vpnsin/devkit/eslint/base';
// ESLint (needs jiti) and commitlint both load TypeScript config files natively,
// so these shims are .ts. lint-staged stays .mjs: its .ts auto-detection is
// unreliable and would silently break the bare `npx lint-staged` pre-commit hook.
writeFileIfAbsent('eslint.config.ts', `export { default } from '${eslintPreset}';\n`);
writeFileIfAbsent(
  'commitlint.config.ts',
  `export { default } from '@vpnsin/devkit/commitlint';\n`
);
writeFileIfAbsent(
  '.lintstagedrc.mjs',
  `export { default } from '@vpnsin/devkit/lint-staged';\n`
);

// TypeScript: scaffold a tsconfig that extends the shared base (only if absent).
const tsconfigBody = isNext
  ? {
      extends: '@vpnsin/devkit/tsconfig/next.json',
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }
  : {
      extends: '@vpnsin/devkit/tsconfig/node.json',
      compilerOptions: { outDir: 'dist', rootDir: 'src' },
      include: ['src/**/*.ts'],
      exclude: ['node_modules', 'dist'],
    };
writeFileIfAbsent('tsconfig.json', `${JSON.stringify(tsconfigBody, null, 2)}\n`);

// Test runner (opt-in): shim the shared preset. Jest or Vitest, not both.
// Vitest loads .ts config natively (esbuild). Jest stays .mjs: its ts-node loader
// transpiles to CJS and cannot re-export devkit's ESM preset from a .ts config.
if (has('--jest')) {
  writeFileIfAbsent('jest.config.mjs', `export { default } from '@vpnsin/devkit/jest';\n`);
}
if (has('--vitest')) {
  writeFileIfAbsent(
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config';\nimport base from '@vpnsin/devkit/vitest';\nexport default defineConfig(base);\n`
  );
}

// ── 1b. App starter (opt-in) ────────────────────────────────────────────────
if (wantsBackend) {
  console.log(c.bold('\nBackend app (Express + TypeScript)'));
  copyTemplate('app/backend/src/server.ts', 'src/server.ts');
  copyTemplate('app/backend/src/app.ts', 'src/app.ts');
  copyTemplate('app/backend/src/routes/health.ts', 'src/routes/health.ts');
  copyTemplate('app/backend/src/env.ts', 'src/env.ts');
  copyTemplate('app/backend/env.example', '.env.example');
  copyTemplate('app/backend/Dockerfile', 'Dockerfile');
  copyTemplate('app/backend/dockerignore', '.dockerignore');
}
if (wantsFrontend) {
  console.log(c.bold('\nFrontend app (Next.js App Router + TypeScript)'));
  copyTemplate('app/frontend/app/layout.tsx', 'app/layout.tsx');
  copyTemplate('app/frontend/app/page.tsx', 'app/page.tsx');
  copyTemplate('app/frontend/app/globals.css', 'app/globals.css');
  copyTemplate('app/frontend/next.config.mjs', 'next.config.mjs');
  copyTemplate('app/frontend/env.example', '.env.example');
}

// ── 2. Copied templates ─────────────────────────────────────────────────────
console.log(c.bold('\nEditor & hooks'));
copyTemplate('husky/pre-commit', '.husky/pre-commit', { executable: true });
copyTemplate('husky/commit-msg', '.husky/commit-msg', { executable: true });
copyTemplate('vscode/settings.json', '.vscode/settings.json');
copyTemplate('vscode/extensions.json', '.vscode/extensions.json');
copyTemplate('editorconfig', '.editorconfig');
copyTemplate('nvmrc', '.nvmrc');
copyTemplate('npmrc', '.npmrc');
copyTemplate('markdownlint-cli2.jsonc', '.markdownlint-cli2.jsonc');
copyTemplate('cspell.json', 'cspell.json');

console.log(c.bold('\nGitHub workflows'));
// Always free on public + private:
copyTemplate('github/workflows/ci.yml', '.github/workflows/ci.yml');
// With --publish, use the release-please workflow that ALSO publishes to npm when
// the release PR is merged. (A GITHUB_TOKEN-created release can't trigger a
// separate on:release workflow, so the publish step must be integrated here.)
copyTemplate(
  has('--publish')
    ? 'github/workflows/release-please-publish.yml'
    : 'github/workflows/release-please.yml',
  '.github/workflows/release-please.yml'
);
copyTemplate('release-please-config.json', 'release-please-config.json');
writeFileIfAbsent(
  '.release-please-manifest.json',
  `${JSON.stringify({ '.': pkg.version || '0.0.0' }, null, 2)}\n`
);
copyTemplate('dependabot.yml', '.github/dependabot.yml');

if (isPrivate) {
  log.info(
    'private repo → skipping GHAS workflows (CodeQL/Trivy/Dependency Review need a paid licence)'
  );
  log.info('dependency security covered by Dependabot + the npm audit step in ci.yml');
} else {
  // GHAS — free on public repos:
  copyTemplate('github/workflows/codeql.yml', '.github/workflows/codeql.yml');
  copyTemplate('github/workflows/dependency-review.yml', '.github/workflows/dependency-review.yml');
  copyTemplate('github/workflows/trivy.yml', '.github/workflows/trivy.yml');
}

if (has('--scorecard')) {
  if (isPrivate) log.info('Scorecard needs a public repo — skipping');
  else copyTemplate('github/workflows/scorecard.yml', '.github/workflows/scorecard.yml');
}
if (has('--publish')) {
  // Manual recovery workflow; auto-publish lives in release-please.yml (above).
  copyTemplate('github/workflows/publish.yml', '.github/workflows/publish.yml');
}
if (has('--sonar')) {
  copyTemplate('github/workflows/sonarqube.yml', '.github/workflows/sonarqube.yml');
  copyTemplate('sonar-project.properties', 'sonar-project.properties');
}
if (has('--lighthouse')) {
  copyTemplate('github/workflows/lighthouse.yml', '.github/workflows/lighthouse.yml');
  copyTemplate('lighthouserc.json', 'lighthouserc.json');
}

console.log(c.bold('\nGovernance & docs'));
copyTemplate('github/PULL_REQUEST_TEMPLATE.md', '.github/PULL_REQUEST_TEMPLATE.md');
copyTemplate('github/SECURITY.md', '.github/SECURITY.md');
copyTemplate('github/CONTRIBUTING.md', '.github/CONTRIBUTING.md');
copyTemplate('github/CODEOWNERS', '.github/CODEOWNERS');
copyTemplate('github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/bug_report.yml');
copyTemplate(
  'github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml'
);
copyTemplate('github/ISSUE_TEMPLATE/config.yml', '.github/ISSUE_TEMPLATE/config.yml');
copyTemplate('README.template.md', 'README.md'); // only if absent (never clobbers)

if (has('--skills')) {
  console.log(c.bold('\nClaude Code skills'));
  copyTemplate('claude/skills/design-craft/SKILL.md', '.claude/skills/design-craft/SKILL.md');
}

// ── 2c. Scratch workspace ────────────────────────────────────────────────────
console.log(c.bold('\nScratch workspace (temp/)'));
for (const f of [
  'format.js',
  'format.ts',
  'format.json',
  'format.env',
  'format.log',
  'format.sh',
  'format.pwsh',
  'format.txt',
  'format.md',
  'format.http',
]) {
  copyTemplate(`temp/${f}`, `temp/${f}`);
}
ensureGitignoreEntry('temp/');

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
  ...(wantsBackend
    ? { dev: 'tsx watch src/server.ts', build: 'tsc', start: 'node dist/server.js' }
    : {}),
  ...(wantsFrontend ? { dev: 'next dev', build: 'next build', start: 'next start' } : {}),
  ...(has('--jest')
    ? { test: 'jest', 'test:watch': 'jest --watch', 'test:coverage': 'jest --coverage' }
    : {}),
  ...(has('--vitest')
    ? { test: 'vitest run', 'test:watch': 'vitest', 'test:coverage': 'vitest run --coverage' }
    : {}),
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
  pkg.prettier = '@vpnsin/devkit/prettier';
  changed = true;
  log.add('prettier');
} else {
  log.skip('prettier');
}
if (changed) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

// ── 4. Install dev dependencies ─────────────────────────────────────────────
const devDeps = [
  '@vpnsin/devkit',
  'eslint',
  'prettier',
  'husky',
  'lint-staged',
  '@commitlint/cli',
  'markdownlint-cli2',
  'typescript',
  'jiti', // lets ESLint load the eslint.config.ts shim (Node < 24.3)
  ...(isNext ? ['eslint-config-next'] : []),
  ...(has('--jest') ? ['jest', 'ts-jest', '@types/jest'] : []),
  ...(has('--vitest') ? ['vitest', '@vitest/coverage-v8'] : []),
  ...(wantsBackend ? ['tsx', '@types/node', '@types/express', '@types/cors'] : []),
  ...(wantsFrontend ? ['@types/react', '@types/react-dom'] : []),
];

// Runtime dependencies for the app starters (installed without -D).
const prodDeps = [
  ...(wantsBackend ? ['express', 'cors', 'helmet', 'dotenv'] : []),
  ...(wantsFrontend ? ['next', 'react', 'react-dom'] : []),
];

if (has('--no-install')) {
  console.log(c.bold('\nDependencies'));
  log.info(`Skipped (--no-install). Install manually:`);
  if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
  log.info(`npm i -D ${devDeps.join(' ')}`);
} else {
  console.log(c.bold('\nInstalling dependencies…'));
  if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
  log.info(`npm i -D ${devDeps.join(' ')}`);
  try {
    if (prodDeps.length)
      execSync(`npm install ${prodDeps.join(' ')}`, { cwd: CWD, stdio: 'inherit' });
    execSync(`npm install -D ${devDeps.join(' ')}`, { cwd: CWD, stdio: 'inherit' });
  } catch {
    console.log(c.yellow('\n  ! Install failed — run it manually:'));
    if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
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
console.log(`\n${c.green('✓ devkit wired up.')}\n`);
console.log(`${c.bold('Next steps:')}`);
console.log(
  `  1. Fill placeholders: ${c.cyan('.github/CODEOWNERS')} (@OWNER) and the security contact in ${c.cyan('.github/SECURITY.md')}.`
);
console.log(`  2. One-time normalise formatting:   ${c.cyan('npm run format')}`);
console.log(
  `  3. Verify the gates:                ${c.cyan('npm run lint && npm run type-check && npm run lint:md')}`
);
console.log(
  `  4. In GitHub repo settings, enable Code scanning, Secret scanning & Dependency graph.`
);
console.log(
  `  5. Commit with a Conventional Commit ${c.dim('e.g. git commit -m "chore: adopt devkit"')}`
);
if (wantsBackend || wantsFrontend) {
  console.log(
    `  6. Run the app:                     ${c.cyan('npm run dev')} ${c.dim('(copy .env.example → .env first)')}`
  );
}
console.log('');
