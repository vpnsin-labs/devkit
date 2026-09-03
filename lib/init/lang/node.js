// Node.js / Next.js language module — config shims that re-export this package,
// the Express / Next.js / MERN app starters, package.json script merging,
// dependency installation and Husky hook setup. (Moved from the original
// single-file CLI so the Node scaffold is unchanged.)

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// ── 1. Config shims (kept in sync with the package) ─────────────────────────
export function configureNode(ctx) {
  const { has, isMonorepo, isNext, c, fs } = ctx;
  console.log(c.bold('Config shims'));
  // ESLint (needs jiti) and commitlint both load TypeScript config files natively,
  // so these shims are .ts. lint-staged stays .mjs: its .ts auto-detection is
  // unreliable and would silently break the bare `npx lint-staged` pre-commit hook.
  // commitlint + lint-staged live at the repo root in every layout (incl. monorepo).
  fs.writeFileIfAbsent(
    'commitlint.config.ts',
    `export { default } from '@vpnsin-labs/devkit/commitlint';\n`
  );
  fs.writeFileIfAbsent(
    '.lintstagedrc.mjs',
    `export { default } from '@vpnsin-labs/devkit/lint-staged';\n`
  );

  if (isMonorepo) {
    // Fullstack monorepo: a single root ESLint config lints both workspaces (the
    // base preset's parser handles .ts and .tsx alike). Each workspace ships its
    // own tsconfig, so the type-check gate runs per workspace — no root tsconfig.
    fs.writeFileIfAbsent(
      'eslint.config.ts',
      `export { default } from '@vpnsin-labs/devkit/eslint/base';\n`
    );
    return;
  }

  const eslintPreset = isNext
    ? '@vpnsin-labs/devkit/eslint/next'
    : '@vpnsin-labs/devkit/eslint/base';
  fs.writeFileIfAbsent('eslint.config.ts', `export { default } from '${eslintPreset}';\n`);

  // TypeScript: scaffold a tsconfig that extends the shared base (only if absent).
  const tsconfigBody = isNext
    ? {
        extends: '@vpnsin-labs/devkit/tsconfig/next.json',
        include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
        exclude: ['node_modules'],
      }
    : {
        extends: '@vpnsin-labs/devkit/tsconfig/node.json',
        compilerOptions: { outDir: 'dist', rootDir: 'src' },
        include: ['src/**/*.ts'],
        exclude: ['node_modules', 'dist'],
      };
  fs.writeFileIfAbsent('tsconfig.json', `${JSON.stringify(tsconfigBody, null, 2)}\n`);

  // Test runner (opt-in): shim the shared preset. Jest or Vitest, not both.
  // Vitest loads .ts config natively (esbuild). Jest stays .mjs: its ts-node loader
  // transpiles to CJS and cannot re-export devkit's ESM preset from a .ts config.
  if (has('--jest')) {
    fs.writeFileIfAbsent(
      'jest.config.mjs',
      `export { default } from '@vpnsin-labs/devkit/jest';\n`
    );
  }
  if (has('--vitest')) {
    fs.writeFileIfAbsent(
      'vitest.config.ts',
      `import { defineConfig } from 'vitest/config';\nimport base from '@vpnsin-labs/devkit/vitest';\nexport default defineConfig(base);\n`
    );
  }
}

// ── 1b. App starters (opt-in) ───────────────────────────────────────────────
export function scaffoldNodeStarters(ctx) {
  const { wantsBackend, wantsFrontend, wantsFullstack, c, fs } = ctx;
  const { copyTemplate } = fs;
  if (wantsBackend) {
    console.log(c.bold('\nBackend app (Express + TypeScript)'));
    copyTemplate('app/backend/src/server.ts', 'src/server.ts');
    copyTemplate('app/backend/src/app.ts', 'src/app.ts');
    copyTemplate('app/backend/src/routes/health.ts', 'src/routes/health.ts');
    copyTemplate('app/backend/src/env.ts', 'src/env.ts');
    copyTemplate('app/backend/env.example', '.env.example');
    copyTemplate('app/backend/Dockerfile', 'Dockerfile');
    copyTemplate('app/backend/dockerignore', '.dockerignore');
    copyTemplate('app/backend/render.yaml', 'render.yaml');
  }
  if (wantsFrontend) {
    console.log(c.bold('\nFrontend app (Next.js App Router + TypeScript)'));
    copyTemplate('app/frontend/app/layout.tsx', 'app/layout.tsx');
    copyTemplate('app/frontend/app/page.tsx', 'app/page.tsx');
    copyTemplate('app/frontend/app/globals.css', 'app/globals.css');
    copyTemplate('app/frontend/next.config.mjs', 'next.config.mjs');
    copyTemplate('app/frontend/env.example', '.env.example');
  }
  if (wantsFullstack) {
    console.log(c.bold('\nFullstack monorepo (Next.js + Express + MongoDB)'));
    // Backend workspace — Express + Mongoose + Jest.
    copyTemplate('app/fullstack/backend/package.json', 'backend/package.json');
    copyTemplate('app/fullstack/backend/tsconfig.json', 'backend/tsconfig.json');
    copyTemplate('app/fullstack/backend/tsconfig.build.json', 'backend/tsconfig.build.json');
    copyTemplate('app/fullstack/backend/jest.config.mjs', 'backend/jest.config.mjs');
    copyTemplate('app/fullstack/backend/Dockerfile', 'backend/Dockerfile');
    copyTemplate('app/fullstack/backend/dockerignore', 'backend/.dockerignore');
    copyTemplate('app/fullstack/backend/env.example', 'backend/.env.example');
    copyTemplate('app/fullstack/backend/src/server.ts', 'backend/src/server.ts');
    copyTemplate('app/fullstack/backend/src/app.ts', 'backend/src/app.ts');
    copyTemplate('app/fullstack/backend/src/env.ts', 'backend/src/env.ts');
    copyTemplate('app/fullstack/backend/src/db.ts', 'backend/src/db.ts');
    copyTemplate('app/fullstack/backend/src/routes/health.ts', 'backend/src/routes/health.ts');
    copyTemplate('app/fullstack/backend/src/app.test.ts', 'backend/src/app.test.ts');
    // Frontend workspace — Next.js App Router.
    copyTemplate('app/fullstack/frontend/package.json', 'frontend/package.json');
    copyTemplate('app/fullstack/frontend/tsconfig.json', 'frontend/tsconfig.json');
    copyTemplate('app/fullstack/frontend/global.d.ts', 'frontend/global.d.ts');
    copyTemplate('app/fullstack/frontend/next.config.mjs', 'frontend/next.config.mjs');
    copyTemplate('app/fullstack/frontend/env.example', 'frontend/.env.example');
    copyTemplate('app/fullstack/frontend/app/layout.tsx', 'frontend/app/layout.tsx');
    copyTemplate('app/fullstack/frontend/app/page.tsx', 'frontend/app/page.tsx');
    copyTemplate('app/fullstack/frontend/app/globals.css', 'frontend/app/globals.css');
    // Root-level workspace glue.
    copyTemplate('app/fullstack/docker-compose.yml', 'docker-compose.yml');
    copyTemplate('app/fullstack/gitignore', '.gitignore');
    copyTemplate('app/fullstack/gitattributes', '.gitattributes');
    copyTemplate('app/fullstack/prettierignore', '.prettierignore');
  }
}

// Husky hooks (the "hooks" half of "Editor & hooks").
export function scaffoldNodeHooks(ctx) {
  const { fs } = ctx;
  fs.copyTemplate('husky/pre-commit', '.husky/pre-commit', { executable: true });
  fs.copyTemplate('husky/commit-msg', '.husky/commit-msg', { executable: true });
}

// Node/npm version pins.
export function scaffoldNodeVersionFiles(ctx) {
  const { fs } = ctx;
  fs.copyTemplate('nvmrc', '.nvmrc');
  fs.copyTemplate('npmrc', '.npmrc');
}

// ── 3. Merge package.json (scripts, prettier key) ───────────────────────────
export function mergePackageJson(ctx) {
  const { has, isMonorepo, wantsBackend, wantsFrontend, pkg, pkgPath, c, log } = ctx;
  console.log(c.bold('\npackage.json'));
  const scripts = isMonorepo
    ? {
        // Workspace-aware root scripts. `--workspaces --if-present` fans a script
        // out to whichever workspace defines it (e.g. only the backend has tests).
        dev: 'concurrently -k -n backend,frontend -c blue,green "npm:dev:backend" "npm:dev:frontend"',
        'dev:backend': 'npm run dev -w backend',
        'dev:frontend': 'npm run dev -w frontend',
        build: 'npm run build --workspaces --if-present',
        'start:backend': 'npm run start -w backend',
        'start:frontend': 'npm run start -w frontend',
        lint: 'eslint .',
        'lint:fix': 'eslint . --fix',
        'lint:md': 'markdownlint-cli2',
        format: 'prettier --write .',
        'format:check': 'prettier --check .',
        'type-check': 'npm run type-check --workspaces --if-present',
        test: 'npm run test --workspaces --if-present',
        'test:watch': 'npm run test:watch -w backend',
        'test:coverage': 'npm run test:coverage --workspaces --if-present',
        prepare: 'husky',
      }
    : {
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
    pkg.prettier = '@vpnsin-labs/devkit/prettier';
    changed = true;
    log.add('prettier');
  } else {
    log.skip('prettier');
  }
  // Fullstack monorepo: the root is a private npm-workspaces host, never published.
  if (isMonorepo) {
    if (!pkg.private) {
      pkg.private = true;
      changed = true;
      log.add('private: true');
    }
    if (!pkg.workspaces) {
      pkg.workspaces = ['backend', 'frontend'];
      changed = true;
      log.add('workspaces (backend, frontend)');
    }
  }
  if (changed) writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

// ── 4. Install dev dependencies + 5. initialise Husky ───────────────────────
export function installNode(ctx) {
  const { has, isMonorepo, isNext, wantsBackend, wantsFrontend, noInstall, cwd, c, log } = ctx;
  // Shared dev tooling installed at the repo root in every layout.
  const baseDevDeps = [
    '@vpnsin-labs/devkit',
    'eslint',
    'prettier',
    'husky',
    'lint-staged',
    '@commitlint/cli',
    'markdownlint-cli2',
    'typescript',
    'jiti', // lets ESLint load the eslint.config.ts shim (Node < 24.3)
  ];

  // Fullstack monorepo: each workspace declares its own deps in its package.json,
  // so a single root install resolves everything. The root only adds shared tooling
  // plus the test runner (the backend workspace's jest.config.mjs resolves it here)
  // and `concurrently` for the parallel dev script.
  const devDeps = isMonorepo
    ? [
        ...baseDevDeps,
        'concurrently',
        'jest',
        'ts-jest',
        '@types/jest',
        'supertest',
        '@types/supertest',
      ]
    : [
        ...baseDevDeps,
        ...(isNext ? ['eslint-config-next'] : []),
        ...(has('--jest') ? ['jest', 'ts-jest', '@types/jest'] : []),
        ...(has('--vitest') ? ['vitest', '@vitest/coverage-v8'] : []),
        ...(wantsBackend ? ['tsx', '@types/node', '@types/express', '@types/cors'] : []),
        ...(wantsFrontend ? ['@types/react', '@types/react-dom'] : []),
      ];

  // Runtime dependencies for the flat app starters (installed without -D). The
  // fullstack workspaces carry their own runtime deps, so nothing is added here.
  const prodDeps = isMonorepo
    ? []
    : [
        ...(wantsBackend ? ['express', 'cors', 'helmet', 'dotenv'] : []),
        ...(wantsFrontend ? ['next', 'react', 'react-dom'] : []),
      ];

  if (noInstall) {
    console.log(c.bold('\nDependencies'));
    log.info(`Skipped (--no-install). Install manually:`);
    if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
    log.info(`npm i -D ${devDeps.join(' ')}`);
  } else {
    console.log(c.bold('\nInstalling dependencies…'));
    if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
    log.info(`npm i -D ${devDeps.join(' ')}`);
    try {
      if (prodDeps.length) execSync(`npm install ${prodDeps.join(' ')}`, { cwd, stdio: 'inherit' });
      execSync(`npm install -D ${devDeps.join(' ')}`, { cwd, stdio: 'inherit' });
    } catch {
      console.log(c.yellow('\n  ! Install failed — run it manually:'));
      if (prodDeps.length) log.info(`npm i ${prodDeps.join(' ')}`);
      log.info(`npm i -D ${devDeps.join(' ')}`);
    }
  }

  console.log(c.bold('\nHusky'));
  if (noInstall) {
    // Without the install step `npx husky` would download husky just to set hooksPath.
    log.info('Run "npx husky" once after installing to finish hook installation.');
    return;
  }
  try {
    execSync('npx husky', { cwd, stdio: 'ignore' });
    log.info('git hooks installed (core.hooksPath set)');
  } catch {
    log.info('Run "npx husky" once to finish hook installation.');
  }
}

// "Next steps" lines specific to Node: how to verify the gates and run the app.
export function nodeNextSteps(ctx) {
  const { c, wantsFullstack, wantsBackend, wantsFrontend } = ctx;
  const verify = [
    `One-time normalise formatting:   ${c.cyan('npm run format')}`,
    `Verify the gates:                ${c.cyan('npm run lint && npm run type-check && npm run lint:md')}`,
  ];
  const run = [];
  if (wantsFullstack) {
    run.push(
      `Start MongoDB & both apps:       ${c.cyan('docker compose up -d mongo')} ${c.dim('then')} ${c.cyan('npm run dev')}`,
      `   ${c.dim('(copy backend/.env.example → backend/.env first; frontend on :3000, API on :4000)')}`
    );
  } else if (wantsBackend || wantsFrontend) {
    run.push(
      `Run the app:                     ${c.cyan('npm run dev')} ${c.dim('(copy .env.example → .env first)')}`
    );
  }
  return { verify, run };
}
