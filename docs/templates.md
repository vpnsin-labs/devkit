# Templates

`devkit init` copies or generates files into the target repository. This page
documents every template — what it creates, what it configures, and how to
customise it after the initial scaffold.

---

## Contents

- [Git hooks (Husky)](#git-hooks-husky)
- [Editor config (EditorConfig + VS Code)](#editor-config)
- [Node version (.nvmrc)](#node-version)
- [npm config (.npmrc)](#npm-config)
- [Markdownlint](#markdownlint)
- [Spell check (cspell)](#spell-check)
- [TypeScript](#typescript)
- [ESLint](#eslint)
- [Prettier](#prettier)
- [commitlint](#commitlint)
- [lint-staged](#lint-staged)
- [Jest](#jest)
- [Vitest](#vitest)
- [Dependabot](#dependabot)
- [Release Please](#release-please)
- [Governance files](#governance-files)
- [App starters](#app-starters)
- [Scratch workspace (temp/)](#scratch-workspace)
- [Claude Code skills](#claude-code-skills)

---

## Git hooks (Husky)

**Files created:** `.husky/pre-commit`, `.husky/commit-msg`
**Installed:** always

Husky wires up Git hooks so quality checks run automatically on every commit.

### `pre-commit` — staged-file lint

```sh
npx lint-staged
```

Runs lint-staged, which reads `.lintstagedrc.mjs` and applies only the relevant
linters to files that are staged (i.e., `git add`ed). This keeps the pre-commit hook
fast — only changed files are checked, never the entire codebase.

### `commit-msg` — conventional commit enforcement

```sh
npx --no-install commitlint --edit "$1"
```

Validates the commit message against the
[Conventional Commits](https://www.conventionalcommits.org/) spec before the commit
is recorded. An invalid message aborts the commit with a clear error.

**Format:** `type(scope): description`

| Valid | Invalid |
| --- | --- |
| `feat: add user auth` | `added user auth` |
| `fix(api): handle null body` | `Fix: null body` |
| `chore!: drop Node 16 support` | `BREAKING: drop Node 16` |

**Bypassing hooks (emergencies only):**

```bash
git commit --no-verify -m "chore: emergency fix"
```

Use sparingly — bypassed commits will still be checked by CI.

---

## Editor config

**Files created:** `.editorconfig`, `.vscode/settings.json`, `.vscode/extensions.json`
**Installed:** always

### `.editorconfig`

Universal, editor-agnostic baseline that any editor respecting the EditorConfig
standard will pick up automatically:

| Setting | Value | Reason |
| --- | --- | --- |
| `charset` | `utf-8` | Universal encoding |
| `end_of_line` | `lf` | Cross-platform consistency (Windows devs: configure Git `core.autocrlf=input`) |
| `indent_style` | `space` | |
| `indent_size` | `2` | Matches Prettier default |
| `insert_final_newline` | `true` | POSIX requirement, avoids noisy diffs |
| `trim_trailing_whitespace` | `true` | Except `*.md` where trailing spaces are semantic |
| `*.{bat,cmd}` | `crlf` | Windows batch files require CRLF |

### `.vscode/settings.json`

Configures VS Code to match the project's toolchain:

- **Format on save** with Prettier (`editor.formatOnSave: true`). Only runs when a
  Prettier config is detected (`prettier.requireConfig: true`), so unconfigured
  projects in the same workspace are left alone.
- **ESLint fix on save** (`source.fixAll.eslint: explicit`) using the flat config
  format (`eslint.useFlatConfig: true`).
- **Markdownlint fix on save** for `.md` files only.
- **Rulers at 100 columns** matching Prettier's `printWidth`.
- **TypeScript workspace SDK** — always uses the project's own TypeScript version,
  not VS Code's bundled one.
- **`search.exclude`** — hides `node_modules`, `dist`, `build`, `coverage`, `.next`
  from the file explorer and global search.

### `.vscode/extensions.json`

Prompts the team to install a shared extension set the first time they open the
repo. Extensions are recommendations only — nothing breaks if skipped.

Key groups:

| Group | Extensions |
| --- | --- |
| Formatting & lint | Prettier, ESLint, markdownlint, Code Spell Checker, EditorConfig |
| DX | Error Lens (inline errors), Pretty TS Errors, Import Cost |
| Authoring | React snippets, auto-rename tag, npm intellisense, path intellisense |
| Testing | vscode-jest, jest-runner, jest-snippets |
| Git | GitLens, Git History, Open in GitHub, GitHub Pull Requests |
| File types | dotenv, YAML, GitHub Actions |
| Markdown | Markdown All in One, Mermaid preview, Markdown PDF |

---

## Node version

**File created:** `.nvmrc`
**Installed:** always

Contains a single line: the major Node version (`22`).

```
22
```

This file is the **single source of truth** for the Node version across:

- Local development — `nvm use` or `fnm use` read it automatically
- CI — `actions/setup-node` reads it via `node-version-file: .nvmrc`
- Docker — `FROM node:$(cat .nvmrc)-alpine` in the generated Dockerfile

To upgrade Node, change `.nvmrc` and CI picks it up on the next run.

---

## npm config

**File created:** `.npmrc`
**Installed:** always

```ini
engine-strict=true
fund=false
# save-exact=true  (uncomment for applications)
```

| Setting | Effect |
| --- | --- |
| `engine-strict=true` | `npm install` fails if the local Node/npm version doesn't satisfy `package.json "engines"`. Prevents silent version mismatches. |
| `fund=false` | Suppresses funding messages in install output. |
| `save-exact` (commented) | Pins exact versions in `package.json` instead of semver ranges. Recommended for deployed apps; left commented for libraries. |

---

## Markdownlint

**File created:** `.markdownlint-cli2.jsonc`
**Installed:** always
**Script added:** `lint:md`

```bash
npm run lint:md         # check
npm run lint:md -- --fix  # auto-fix
```

Lints all `**/*.md` files using
[markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2).

The config is tuned to coexist with Prettier (which owns line length and whitespace):

| Rule | Setting | Reason |
| --- | --- | --- |
| `MD013` (line length) | disabled | Prettier wraps lines |
| `MD033` (inline HTML) | disabled | `<details>`, `<kbd>` etc. are valid in GitHub Markdown |
| `MD036` (bold as heading) | disabled | Intentional bold taglines |
| `MD041` (first-line heading) | disabled | `package.json` `description` files, changelogs |
| `MD024` (duplicate headings) | `siblings_only: true` | Same heading in different sections is fine |

**Ignored:** `node_modules`, `.next`, `dist`, `build`, `CHANGELOG.md`,
`.github/**/*.md` (auto-generated files).

---

## Spell check

**File created:** `cspell.json`
**Installed:** always
**VS Code extension:** `streetsidesoftware.code-spell-checker` (recommended)

Spell-checks source code, identifiers, comments, and documentation using the
[Code Spell Checker](https://cspell.org) dictionary.

**Adding project-specific words:**

```json
{
  "words": ["devkit", "commitlint", "nvmrc", "monorepo", "semver"]
}
```

Add any domain-specific terms (API names, product names, abbreviations) to the
`words` array so they aren't flagged.

**Ignoring paths:**

```json
{
  "ignorePaths": ["node_modules", "dist", "CHANGELOG.md", "*.min.js"]
}
```

---

## TypeScript

**File created:** `tsconfig.json`
**Installed:** always (when not `--frontend`/`--backend` with their own tsconfig)

A thin file that extends the shared devkit base:

```jsonc
// Node project
{ "extends": "@vpnsin-labs/devkit/tsconfig/node.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"] }

// Next.js project
{ "extends": "@vpnsin-labs/devkit/tsconfig/next.json",
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"] }
```

**Shared base settings** (`tsconfig/base.json`):

| Option | Value |
| --- | --- |
| `strict` | `true` (enables all strict flags) |
| `noUncheckedIndexedAccess` | `true` |
| `exactOptionalPropertyTypes` | `true` |
| `noImplicitOverride` | `true` |
| `moduleResolution` | `bundler` |
| `verbatimModuleSyntax` | `true` |
| `skipLibCheck` | `true` |

To override any setting, add it directly to your project's `tsconfig.json`:

```jsonc
{
  "extends": "@vpnsin-labs/devkit/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "noUncheckedIndexedAccess": false   // ← project-level override
  }
}
```

---

## ESLint

**File created:** `eslint.config.ts`
**Installed:** always
**Script added:** `lint`, `lint:fix`

```bash
npm run lint          # check
npm run lint:fix      # auto-fix
```

A thin shim re-exporting the shared flat config:

```ts
// Node project
export { default } from '@vpnsin-labs/devkit/eslint/base';

// Next.js project
export { default } from '@vpnsin-labs/devkit/eslint/next';
```

**What the base config includes:**

- `@eslint/js` recommended rules
- `typescript-eslint` strict + stylistic presets
- `eslint-plugin-prettier` — Prettier violations reported as ESLint errors
- `eslint-config-prettier` — disables all ESLint rules that conflict with Prettier

The `next` config adds `eslint-config-next` on top of the base.

**Extending the config:**

```ts
// eslint.config.ts
import base from '@vpnsin-labs/devkit/eslint/base';
export default [
  ...base,
  {
    rules: {
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/scripts/**'],
    rules: { 'no-console': 'off' },
  },
];
```

**Why `.ts` instead of `.js`?**
ESLint's flat config supports TypeScript config files natively via
[jiti](https://github.com/unjs/jiti) (installed as a devDependency by `devkit init`).
This means `eslint.config.ts` is loaded without a separate build step.

---

## Prettier

**Key added to `package.json`:** `"prettier"`
**Installed:** always
**Scripts added:** `format`, `format:check`

```bash
npm run format          # write
npm run format:check    # CI mode (read-only, exits non-zero on diff)
```

Prettier config is referenced by key (not a separate file) so it stays in sync
via `npm update`:

```jsonc
// package.json
{ "prettier": "@vpnsin-labs/devkit/prettier" }
```

**Shared Prettier settings:**

| Option | Value |
| --- | --- |
| `printWidth` | `100` |
| `singleQuote` | `true` |
| `trailingComma` | `"es5"` |
| `semi` | `true` |
| `arrowParens` | `"always"` |
| `endOfLine` | `"lf"` |

**Overriding settings** — Prettier doesn't support extending a shared config with
overrides in the same `prettier` key. To override, switch to a `prettier.config.js`
file:

```js
// prettier.config.js
import base from '@vpnsin-labs/devkit/prettier';
export default { ...base, printWidth: 120 };
```

---

## commitlint

**File created:** `commitlint.config.ts`
**Installed:** always

```ts
export { default } from '@vpnsin-labs/devkit/commitlint';
```

Re-exports `@commitlint/config-conventional`, which enforces the
[Conventional Commits](https://www.conventionalcommits.org/) specification. The
`commit-msg` Git hook runs commitlint automatically (see [Git hooks](#git-hooks-husky)).

**Adding custom scopes:**

```ts
// commitlint.config.ts
import base from '@vpnsin-labs/devkit/commitlint';
export default {
  ...base,
  rules: {
    ...base.rules,
    'scope-enum': [2, 'always', ['api', 'auth', 'ui', 'db', 'ci']],
  },
};
```

---

## lint-staged

**File created:** `.lintstagedrc.mjs`
**Installed:** always

```js
export { default } from '@vpnsin-labs/devkit/lint-staged';
```

Runs linters only on files staged for commit. The shared preset applies:

| File pattern | Commands |
| --- | --- |
| `*.{js,mjs,cjs,jsx,ts,tsx}` | `eslint --fix`, then `prettier --write` |
| `*.{json,jsonc,css,scss,html,yaml,yml}` | `prettier --write` |
| `*.md` | `markdownlint-cli2 --fix`, then `prettier --write` |

**Adding custom tasks:**

```js
// .lintstagedrc.mjs
import base from '@vpnsin-labs/devkit/lint-staged';
export default {
  ...base,
  '*.{graphql,gql}': ['prettier --write'],
  'src/**/*.ts': ['npm run type-check --'],
};
```

> Appended tasks run after the shared ones. The type-check task example passes
> file paths to `tsc` using `--` to separate the lint-staged arguments.

---

## Jest

**File created:** `jest.config.mjs`
**Installed:** opt-in via `devkit init --jest`
**Scripts added:** `test`, `test:watch`, `test:coverage`

```js
export { default } from '@vpnsin-labs/devkit/jest';
```

The shared Jest preset uses [ts-jest](https://kulshekhar.github.io/ts-jest/) to run
TypeScript tests natively without a separate build step.

**Key preset settings:**

| Setting | Value |
| --- | --- |
| `preset` | `ts-jest` |
| `testEnvironment` | `node` |
| `extensionsToTreatAsEsm` | `['.ts']` |
| `moduleNameMapper` | Maps `^(\\.{1,2}/.*)\\.js$` for ESM imports |

**Extending:**

```js
// jest.config.mjs
import base from '@vpnsin-labs/devkit/jest';
export default {
  ...base,
  testEnvironment: 'jsdom',          // for browser/React tests
  coverageThreshold: {
    global: { lines: 80 },
  },
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/src/$1',  // path alias
  },
};
```

> `jest.config.mjs` stays `.mjs` (not `.ts`) because ts-node transpiles Jest config
> to CommonJS and cannot re-export the devkit's ESM preset. The `.mjs` extension
> forces native ESM loading.

---

## Vitest

**File created:** `vitest.config.ts`
**Installed:** opt-in via `devkit init --vitest`
**Scripts added:** `test`, `test:watch`, `test:coverage`

```ts
import { defineConfig } from 'vitest/config';
import base from '@vpnsin-labs/devkit/vitest';
export default defineConfig(base);
```

The shared Vitest preset is a plain config object (`InlineConfig`) that merges with
`defineConfig`. It configures:

| Setting | Value |
| --- | --- |
| `environment` | `node` |
| `include` | `['**/*.{test,spec}.{ts,tsx}']` |
| Coverage provider | `v8` (via `@vitest/coverage-v8`) |

**Extending:**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@vpnsin-labs/devkit/vitest';
export default mergeConfig(defineConfig(base), defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: { thresholds: { lines: 80 } },
  },
}));
```

Use `mergeConfig` (not object spread) so Vitest can deep-merge array fields like
`include` and `exclude`.

---

## Dependabot

**File created:** `.github/dependabot.yml`
**Installed:** always

Keeps `node_modules` and GitHub Actions pinned versions up to date with weekly PRs.
See the [Dependabot section in the workflows guide](./workflows.md#dependabot) for
configuration options.

---

## Release Please

**Files created:** `release-please-config.json`, `.release-please-manifest.json`
**Installed:** always (alongside the release-please workflow)

`release-please-config.json` controls how release-please computes versions:

```jsonc
{
  "packages": {
    ".": {
      "release-type": "node",          // reads version from package.json
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,    // feat: bumps 0.x → 0.x+1 (not 1.0.0) while < 1.0
      "bump-patch-for-minor-pre-major": true,
      "include-component-in-tag": false,
      "draft": false,
      "prerelease": false
    }
  }
}
```

`.release-please-manifest.json` is auto-managed — do not edit by hand. It tracks the
last released version and is updated by release-please on each release PR merge.

**Monorepo support:** To manage multiple packages, add each package path under
`packages` in the config and point `manifest-file` at a shared manifest.

---

## Governance files

### `CONTRIBUTING.md`

**Created at:** `.github/CONTRIBUTING.md`

Explains the development workflow, branch naming, commit message format, PR
expectations, and the release cadence to contributors.

**What to customise:**
- Replace `vpnsin-labs/devkit` in the devkit reference link with your repo URL.
- Add project-specific setup steps (environment variables, external services).
- Add a "Code of conduct" link if your org has one.

### `SECURITY.md`

**Created at:** `.github/SECURITY.md`

Documents supported versions and the private vulnerability reporting process via
GitHub's security advisory workflow.

**What to customise:**
- Replace `<security@example.com>` with your real security contact.
- Update "Supported versions" to reflect which releases you maintain.

### `CODEOWNERS`

**Created at:** `.github/CODEOWNERS`

```
* @OWNER
```

Automatically requests a review from the listed owners when any file is changed in a
PR. Replace `@OWNER` with your username or a GitHub team (`@org/team`).

**Adding path-specific owners:**

```
# Default owner
* @vpnsin

# DevOps team owns all CI/CD config
/.github/    @your-org/devops

# Backend team owns API routes
/src/routes/ @your-org/backend

# Docs team owns all Markdown files
*.md         @your-org/docs
```

### Pull Request template

**Created at:** `.github/PULL_REQUEST_TEMPLATE.md`

Pre-fills every new PR with:
- A summary section
- A `type of change` checklist (feat / fix / refactor / docs / chore)
- A quality checklist (type-check, lint, build, no secrets)
- A screenshots/notes section

The template reminds contributors that the PR title must be a Conventional Commit,
because release-please reads it to compute the version bump.

### Issue templates

**Created at:**
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`

Structured YAML templates that give contributors a guided form when opening bugs or
feature requests. `config.yml` links to private vulnerability reporting to redirect
security issues away from public issues.

---

## App starters

App starters are opt-in skeletons for a runnable application. They are scaffolded
in addition to all tooling config.

### Backend — Express + TypeScript (`--backend`)

**Files created:**

```
src/
  server.ts          — entry point, graceful shutdown (SIGTERM)
  app.ts             — Express app factory with helmet, cors, JSON body parsing
  env.ts             — typed env validation (exits on missing required vars)
  routes/
    health.ts        — GET /health → { status, version, uptime }
Dockerfile           — multi-stage (builder + slim runtime, non-root user)
.dockerignore
.env.example
```

**Scripts added:** `dev` (`tsx watch`), `build` (`tsc`), `start` (`node dist/server.js`)
**Runtime deps installed:** `express`, `cors`, `helmet`, `dotenv`
**Dev deps installed:** `tsx`, `@types/node`, `@types/express`, `@types/cors`

**Running locally:**

```bash
cp .env.example .env   # fill in MONGO_URI, JWT_SECRET, etc.
npm run dev            # tsx watch — restarts on file change
```

**Dockerfile design:**

```dockerfile
FROM node:22-alpine AS builder  # installs all deps, compiles TypeScript
FROM node:22-alpine             # runtime: copies only dist/ + node_modules (--omit=dev)
                                # runs as non-root user (node:node)
```

### Frontend — Next.js App Router + TypeScript (`--frontend`)

**Files created:**

```
app/
  layout.tsx          — root layout with metadata
  page.tsx            — home page
  globals.css         — global styles (CSS variables, reset)
next.config.mjs
.env.example
```

**Scripts added:** `dev` (`next dev`), `build` (`next build`), `start` (`next start`)
**Runtime deps installed:** `next`, `react`, `react-dom`

### Fullstack monorepo — Next.js + Express + MongoDB (`--fullstack`, alias `--mern`)

A single repository containing **two npm workspaces** — a Next.js frontend and an
Express + MongoDB backend — both versioned independently by release-please. Use this
instead of `--backend`/`--frontend` (which scaffold a single flat app each);
`--fullstack` cannot be combined with them.

**Files created:**

```
backend/                       — workspace: Express + Mongoose API
  package.json                   (name "backend", type module, dev/build/start/test scripts)
  tsconfig.json                  (extends devkit/tsconfig/node)
  jest.config.mjs                (devkit jest preset + ESM `.js`-specifier mapping)
  Dockerfile, .dockerignore
  .env.example                   (NODE_ENV, PORT=4000, MONGO_URI)
  src/
    server.ts                    — connects Mongo, then listens; graceful shutdown
    app.ts                       — Express factory (helmet, cors, json, 404)
    env.ts                       — typed env; required vars abort early
    db.ts                        — Mongoose connect/disconnect helpers
    routes/health.ts             — GET /health → { status, db, uptime }
    app.test.ts                  — supertest coverage of /health and 404
frontend/                      — workspace: Next.js App Router
  package.json                   (name "frontend", dev/build/start scripts)
  tsconfig.json                  (extends devkit/tsconfig/next)
  next.config.mjs
  .env.example                   (NEXT_PUBLIC_API_BASE_URL → http://localhost:4000)
  app/                           layout.tsx, page.tsx, globals.css
docker-compose.yml             — local MongoDB 7 service
.gitignore                     — node_modules, dist, .next, coverage, .env (keeps *.example)
.prettierignore                — build output + CHANGELOGs
release-please-config.json     — two packages (backend, frontend), component-tagged
.release-please-manifest.json  — { "backend": "0.0.0", "frontend": "0.0.0" }
```

**Root `package.json` changes:** `private: true`, `workspaces: ["backend", "frontend"]`,
and workspace-aware scripts:

| Script | Runs |
| --- | --- |
| `npm run dev` | both apps in parallel via `concurrently` (frontend :3000, API :4000) |
| `npm run build` | `npm run build --workspaces --if-present` (tsc + `next build`) |
| `npm run type-check` | `tsc --noEmit` in each workspace |
| `npm test` | the backend Jest suite (the only workspace with tests) |
| `npm run lint` | one root ESLint pass over both workspaces (base preset) |

**Deps installed:** the workspaces declare their own runtime/dev deps
(`express`, `cors`, `helmet`, `dotenv`, `mongoose`; `next`, `react`, `react-dom`;
plus `tsx` and the relevant `@types`), so a single root install resolves
everything. The root adds the shared tooling plus `concurrently`, `jest`,
`ts-jest`, `@types/jest`, `supertest`, `@types/supertest`.

**Versioning:** release-please runs in manifest mode with one entry per workspace
and `include-component-in-tag: true`, so releases are tagged `backend-vX.Y.Z` /
`frontend-vX.Y.Z`. Scope your commits (`feat(backend): …`, `fix(frontend): …`) to
bump the right package; commits touching files under a workspace path are
attributed to it automatically.

**Running locally:**

```bash
docker compose up -d mongo          # start MongoDB on localhost:27017
cp backend/.env.example backend/.env
npm install
npm run dev                          # frontend on :3000, API on :4000
```

---

## Scratch workspace

**Directory created:** `temp/`
**Installed:** always
**Effect on `.gitignore`:** `temp/` is appended (idempotent)

A local scratch directory that is never committed. Populated with reference/starter
files for the most common ad-hoc work in a MERN project:

| File | Use for |
| --- | --- |
| `format.js` | ESM Node.js one-off scripts (`node temp/format.js`) |
| `format.ts` | TypeScript scripts (`npx tsx temp/format.ts`) |
| `format.json` | API payload drafts, test data, config sketches |
| `format.env` | Local env-var overrides — never leave `temp/` |
| `format.log` | Paste and annotate log output |
| `format.sh` | `curl`/`jq` CRUD stubs against `$BASE_URL` |
| `format.pwsh` | PowerShell `Invoke-RestMethod` equivalents |
| `format.txt` | Free-form TODO / notes / scratch pad |
| `format.md` | Structured notes with ToC, tables, code blocks, Mermaid diagrams |
| `format.http` | VS Code REST Client requests (requires `humao.rest-client`) |

Each file is pre-filled with a working skeleton for its format. Copy and rename a
file to start a new scratch task: `cp temp/format.sh temp/seed-db.sh`.

Re-running `devkit init` skips existing `temp/` files; `devkit init --force` resets
them to the template defaults.

---

## Claude Code skills

**File created:** `.claude/skills/design-craft/SKILL.md`
**Installed:** opt-in via `devkit init --skills`

A [Claude Code skill](https://docs.anthropic.com/claude-code) that gives the AI
assistant a structured UX/visual-design protocol for frontend work. When active,
Claude follows the design-craft workflow before suggesting any visual changes:
reviewing existing conventions, proposing options, and getting explicit approval
before writing code.

Install this in repos where you want Claude to act as a disciplined design
collaborator rather than making spontaneous visual decisions.
